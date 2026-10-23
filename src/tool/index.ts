// 工具声明：聊天截图转客户档案
import { Contact as ContactAsIcon } from 'lucide-react';
import type { BatchTool, RunContext } from '../kit/types';
import {
  HEADER, WIDTHS, buildMessages, byIntent, excelRow, isFatalLlmError, maskPhones, parseProfile, profileText, safeName, summaryOf, verifyProfile,
  type Profile,
} from './core';
import { writeXlsx } from './xlsx';

type Data = { file: string; profile: Profile; notes: string[]; chatText: string };

/** 抽取一张截图的档案：解析失败重试一次；配置错误等致命错误直接抛出 */
async function extract(chatText: string, myName: string, ctx: RunContext): Promise<Profile> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseProfile(await ctx.llm(buildMessages(chatText, myName), { json: true, temperature: 0.2 }));
    } catch (e) {
      if (isFatalLlmError(e)) throw e;
      last = e;
    }
  }
  throw last;
}

const tool: BatchTool = {
  id: 'w13',
  name: '聊天截图转客户档案',
  tagline: '批量拖入微信聊天截图，在本机识别文字，再由你配置的大模型整理出客户称呼、需求、预算、意向和联系方式，导出客户档案 Excel。只处理已征得对方同意的聊天内容。',
  icon: ContactAsIcon,
  category: '微信私域',
  type: 'data',
  mode: 'batch',
  resultView: 'list',
  needsLLM: true,
  concurrency: 1,
  accept: { label: '聊天截图', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] },
  params: [
    {
      key: 'consent', label: '已征得聊天对方同意', type: 'toggle', default: false,
      help: '聊天记录里有对方的个人信息，请只处理已经征得对方同意的内容，并按《个人信息保护法》等规定妥善保管导出的档案。不打开不能开始。',
    },
    {
      key: 'mask', label: '手机号打码后再发给大模型', type: 'toggle', default: true,
      help: '文字识别在本机完成；整理档案时，识别出的文字会发给你在「设置」里配置的大模型。打开后手机号中间四位换成 ****，导出时在本机还原完整号码。',
    },
    { key: 'myName', label: '我方微信昵称', type: 'text', default: '', placeholder: '可选，例如：小王（店长）', help: '填了能更准地分出哪一方是客户' },
    { key: 'name', label: '档案文件名', type: 'text', default: '客户档案' },
    { key: 'out', label: '保存到', type: 'folder', default: '' },
  ],

  async run(item, ctx) {
    const p = ctx.params;
    if (!p.consent) throw new Error('请先确认已征得聊天对方同意（打开「已征得聊天对方同意」）');
    const { recognize } = await import('./ocr');
    const r = await recognize(await ctx.readFile(item.path!), { useCls: false, minScore: 0.5 }, (x) => ctx.progress(x * 0.6), ctx.signal);
    const chatText = r.lines.map((l) => l.text).join('\n').trim();
    if (!chatText) throw new Error('截图里没有识别到文字');
    ctx.progress(0.65);
    const sent = p.mask ? maskPhones(chatText) : chatText;
    const raw = await extract(sent, String(p.myName ?? ''), ctx);
    const { profile, notes } = verifyProfile(raw, chatText);
    ctx.progress(1);
    const data: Data = { file: item.name, profile, notes, chatText };
    const text = profileText(profile, notes);
    return { summary: summaryOf(profile), text, copyText: text, data };
  },

  async afterAll(results, ctx) {
    const items = results.map((r) => r.result.data as Data | undefined).filter((d): d is Data => !!d);
    if (!items.length) return;
    const rows = byIntent(items).map((d) => excelRow(d.file, d.profile, d.notes, d.chatText));
    const path = await ctx.join(ctx.outputDir, `${safeName(String(ctx.params.name).trim() || '客户档案')}.xlsx`);
    await ctx.writeFile(path, await writeXlsx('客户档案', HEADER, rows, WIDTHS));
    const high = items.filter((d) => d.profile.intent === '高').length;
    return `已整理 ${items.length} 份客户档案（高意向 ${high} 位），按意向从高到低排列：${path}`;
  },
};

export default tool;
