import { describe, expect, it, vi } from 'vitest';
import type { InputItem, ItemResult, Params, RunContext } from '../kit/types';
import { readFirstSheet } from './xlsx';

// 识别本身在浏览器里跑（需要画布和 WASM），这里把文件内容当作识别结果
vi.mock('./ocr', () => ({
  recognize: async (bytes: Uint8Array) => {
    const t = new TextDecoder().decode(bytes);
    if (t === 'BAD') throw new Error('无法识别这张图片，可能已损坏或格式不受支持');
    return { lines: t ? t.split('\n').map((text) => ({ text, score: 0.95, boxes: [] })) : [], width: 100, height: 100 };
  },
}));
const { default: tool } = await import('./index');

const CHAT_A = '示例客户·陈女士\n想买 6 台空气净化器，预算 3000 元左右\n电话 13800138000';
const CHAT_B = '示例客户·林先生\n复印机我再考虑一下';
const REPLY_A = '{"name":"陈女士","phone":"138****8000","wechat":"","needs":"空气净化器 6 台","budget":"3000 元左右","intent":"高","concerns":"","nextStep":"确认送货时间","evidence":"预算 3000 元左右"}';
const REPLY_B = '```json\n{"name":"林先生","wechat":"lin_fake","needs":"复印机","budget":"","intent":"低"}\n```';

type Llm = RunContext['llm'];
function fakeCtx(files: Map<string, Uint8Array>, params: Params, llm: Llm): RunContext {
  return {
    params, outputDir: '/out', signal: new AbortController().signal, progress: () => {},
    readFile: async (p) => files.get(p)!,
    readText: async (p) => new TextDecoder().decode(files.get(p)!),
    writeFile: async (p, d) => void files.set(p, d),
    writeText: async (p, t) => void files.set(p, new TextEncoder().encode(t)),
    mkdir: async () => {}, join: async (...parts) => parts.join('/'), llm, sidecar: async () => '',
  };
}
const defaults = (over: Params = {}): Params => ({ ...Object.fromEntries(tool.params.map((f) => [f.key, f.default])), consent: true, ...over });
const enc = (s: string) => new TextEncoder().encode(s);
const item = (name: string): InputItem => ({ id: name, name, path: '/in/' + name });

/** 假大模型：按聊天内容返回固定回复，并记下收到的文字 */
function fakeLlm(sent: string[]): Llm {
  return async (messages) => {
    const user = messages[1].content;
    sent.push(user);
    return user.includes('陈女士') ? REPLY_A : REPLY_B;
  };
}

describe('整理客户档案', () => {
  it('每张截图一份档案，导出按意向排序的 Excel，联系方式按原文核对', async () => {
    const files = new Map([['/in/b.png', enc(CHAT_B)], ['/in/a.png', enc(CHAT_A)]]);
    const sent: string[] = [];
    const ctx = fakeCtx(files, defaults({ name: '十月客户' }), fakeLlm(sent));
    const results: { item: InputItem; result: ItemResult }[] = [];
    for (const n of ['b.png', 'a.png']) results.push({ item: item(n), result: await tool.run(item(n), ctx) });
    expect(results[1].result.summary).toBe('陈女士 · 意向：高 · 预算 3000 元左右');
    expect(results[0].result.text).toContain('提示：微信号「lin_fake」在截图里没找到，已去掉');
    // 默认打码：大模型只看到打码号码
    expect(sent.join()).toContain('138****8000');
    expect(sent.join()).not.toContain('13800138000');
    const msg = await tool.afterAll!(results, ctx);
    expect(msg).toBe('已整理 2 份客户档案（高意向 1 位），按意向从高到低排列：/out/十月客户.xlsx');
    const sheet = await readFirstSheet(files.get('/out/十月客户.xlsx')!);
    expect(sheet[0].slice(0, 7)).toEqual(['截图文件', '客户称呼', '意向', '预算', '需求', '关注点 / 顾虑', '手机号']);
    expect(sheet[1].slice(0, 7)).toEqual(['a.png', '陈女士', '高', '3000 元左右', '空气净化器 6 台', '', '13800138000']);
    expect(sheet[2].slice(0, 3)).toEqual(['b.png', '林先生', '低']);
  });

  it('关闭打码时原样发送', async () => {
    const sent: string[] = [];
    await tool.run(item('a.png'), fakeCtx(new Map([['/in/a.png', enc(CHAT_A)]]), defaults({ mask: false }), fakeLlm(sent)));
    expect(sent[0]).toContain('13800138000');
  });

  it('没确认已征得同意时不处理，也不调用大模型', async () => {
    const llm = vi.fn();
    await expect(tool.run(item('a.png'), fakeCtx(new Map([['/in/a.png', enc(CHAT_A)]]), defaults({ consent: false }), llm))).rejects.toThrow('请先确认已征得聊天对方同意');
    expect(llm).not.toHaveBeenCalled();
  });

  it('没识别到文字、图片损坏时报错', async () => {
    const files = new Map([['/in/空白.png', enc('')], ['/in/坏.png', enc('BAD')]]);
    const ctx = fakeCtx(files, defaults(), fakeLlm([]));
    await expect(tool.run(item('空白.png'), ctx)).rejects.toThrow('截图里没有识别到文字');
    await expect(tool.run(item('坏.png'), ctx)).rejects.toThrow('无法识别这张图片');
  });

  it('回复不是 JSON 时重试一次，仍失败就报错', async () => {
    const llm = vi.fn(async () => '抱歉');
    await expect(tool.run(item('a.png'), fakeCtx(new Map([['/in/a.png', enc(CHAT_A)]]), defaults(), llm))).rejects.toThrow('不是有效的 JSON');
    expect(llm).toHaveBeenCalledTimes(2);
    const ok = vi.fn().mockResolvedValueOnce('乱码').mockResolvedValueOnce(REPLY_A);
    const r = await tool.run(item('a.png'), fakeCtx(new Map([['/in/a.png', enc(CHAT_A)]]), defaults(), ok));
    expect(r.summary).toContain('陈女士');
  });

  it('大模型没配置或密钥错时不重试', async () => {
    const llm = vi.fn(async () => { throw new Error('大模型调用失败（401，密钥不对或已过期）'); });
    await expect(tool.run(item('a.png'), fakeCtx(new Map([['/in/a.png', enc(CHAT_A)]]), defaults(), llm))).rejects.toThrow('401');
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it('全部失败时不导出', async () => {
    expect(await tool.afterAll!([], fakeCtx(new Map(), defaults(), fakeLlm([])))).toBeUndefined();
  });
});
