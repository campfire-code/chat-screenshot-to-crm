// 纯函数：聊天文字整理、手机号打码与还原、抽取提示词、解析大模型回复、核对联系方式、生成表格行。不依赖界面和本机能力。

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type Intent = '高' | '中' | '低' | '未知';

export interface Profile {
  /** 客户称呼或昵称 */
  name: string;
  phone: string;
  wechat: string;
  /** 其他联系方式（邮箱、QQ 等） */
  otherContact: string;
  needs: string;
  budget: string;
  intent: Intent;
  concerns: string;
  nextStep: string;
  /** 原文依据：判断意向和预算所依据的聊天原话 */
  evidence: string;
}

// ---------- 手机号 ----------

/** 中国大陆手机号：1 开头 11 位，前后不能紧挨其他数字；允许中间有空格或横线，例如 138 0013 8000、138-0013-8000 */
const PHONE_LOOSE = /(?<!\d)1[3-9]\d[ -]?\d{4}[ -]?\d{4}(?!\d)/g;

/** 把文字里的手机号中间四位换成 ****（大模型只看到打码后的号码） */
export function maskPhones(text: string): string {
  return text.replace(PHONE_LOOSE, (m) => {
    const d = m.replace(/\D/g, '');
    return `${d.slice(0, 3)}****${d.slice(7)}`;
  });
}

/** 文字里出现的全部手机号（去掉空格横线、去重） */
export function findPhones(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PHONE_LOOSE)) {
    const d = m[0].replace(/\D/g, '');
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

/**
 * 核对大模型给出的手机号：只保留截图原文里真的出现过的号码。
 * 打码过的号码（138****8000）按前三位和后四位到原文里找回完整号码；找不到或对应多个就丢掉。
 */
export function checkPhones(value: string, original: string): string {
  const inText = findPhones(original);
  const out: string[] = [];
  for (const part of value.split(/[,，、;；/\s]+/).filter(Boolean)) {
    const masked = part.match(/^(1\d{2})\*{4}(\d{4})$/);
    let hit: string | undefined;
    if (masked) {
      const c = inText.filter((p) => p.startsWith(masked[1]) && p.endsWith(masked[2]));
      if (c.length === 1) hit = c[0];
    } else {
      const d = part.replace(/[ -]/g, '');
      if (inText.includes(d)) hit = d;
    }
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out.join('、');
}

/** 核对微信号等文字型联系方式：原文（忽略大小写和空格）里出现过才保留 */
export function checkInText(value: string, original: string): string {
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const src = norm(original);
  return value
    .split(/[,，、;；\s]+/)
    .filter((v) => v && src.includes(norm(v)))
    .join('、');
}

// ---------- 提示词 ----------

export const SYSTEM_PROMPT = `你是销售助理，负责把微信聊天截图里识别出的文字整理成客户档案。要求：
1. 只依据给出的聊天文字填写，不推测、不编造。文字里没有的信息一律填空字符串 ""。
2. 联系方式（手机号、微信号、邮箱等）必须原样照抄聊天里出现的，不能补全或改写；打码的号码保持打码。
3. 预算照抄客户说的金额或范围，例如「3000 元左右」「5 千以内」；客户没说就留空，不要估算。
4. 意向只能填「高」「中」「低」「未知」之一：客户主动问价格、交期、付款方式或约时间算「高」；有兴趣但在比较、犹豫算「中」；明确拒绝或敷衍算「低」；看不出来填「未知」。
5. 原文依据：摘抄 1～3 句最能支撑意向和预算判断的客户原话，用「｜」分隔。
6. 只输出 JSON，不要任何解释。`;

export function buildMessages(chatText: string, myName: string): ChatMessage[] {
  const me = myName.trim() ? `\n聊天里「${myName.trim().slice(0, 30)}」是我方（销售），其他人是客户。` : '\n根据内容判断哪一方是客户。';
  const user = `下面是一张聊天截图识别出的文字（OCR 结果，可能有错字和顺序错乱）。${me}

---
${chatText.slice(0, 6000)}
---

按这个格式输出：
{"name": "客户称呼或昵称", "phone": "手机号", "wechat": "微信号", "otherContact": "其他联系方式", "needs": "客户需求", "budget": "预算", "intent": "高/中/低/未知", "concerns": "关注点或顾虑", "nextStep": "下次跟进建议（一句话，基于聊天内容）", "evidence": "原文依据"}`;
  return [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }];
}

// ---------- 解析回复 ----------

/** 从回复里找出 JSON：兼容代码块、前后多余文字、尾逗号、中文引号 */
export function extractJson(text: string): unknown {
  const s = String(text ?? '').trim();
  const candidates: string[] = [];
  const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1].trim());
  candidates.push(s);
  for (const c of candidates) {
    const starts = ['{', '['].map((o) => c.indexOf(o)).filter((i) => i >= 0).sort((a, b) => a - b);
    for (const start of starts) {
      const body = balanced(c, start);
      if (!body) continue;
      for (const variant of [body, body.replace(/,\s*([}\]])/g, '$1'), body.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1')]) {
        try {
          return JSON.parse(variant);
        } catch { /* 换下一种修正方式 */ }
      }
    }
  }
  throw new Error('大模型返回的内容不是有效的 JSON');
}

function balanced(s: string, start: number): string | null {
  const stack: string[] = [];
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') {
      if (stack.pop() !== c) return null;
      if (!stack.length) return s.slice(start, i + 1);
    }
  }
  return null;
}

/** 按多个候选键名取值（大模型可能用中文或别的英文键名） */
function pick(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (o[k] != null) return o[k];
  const lower = Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of keys) if (lower[k.toLowerCase()] != null) return lower[k.toLowerCase()];
  return undefined;
}

/** 统一成一段文字：数组用「、」连接；「无」「未提及」之类当作空 */
function str(v: unknown, sep = '、'): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => str(x, sep)).filter(Boolean).join(sep);
  if (typeof v === 'object') return Object.values(v as object).map((x) => str(x, sep)).filter(Boolean).join(sep);
  const s = String(v).trim();
  return /^(无|没有|未知|未提及|不详|暂无|空|null|none|n\/a|-+)$/i.test(s) ? '' : s;
}

export function normIntent(v: unknown): Intent {
  const s = String(v ?? '').trim();
  if (/^(高|high|a)(意向|类|级)?$/i.test(s)) return '高';
  if (/^(中|中等|一般|medium|mid|b)(意向|类|级)?$/i.test(s)) return '中';
  if (/^(低|low|c)(意向|类|级)?$/i.test(s) || /不高|无意向|没有意向|^低/.test(s)) return '低';
  if (/^高/.test(s)) return '高';
  if (/^中/.test(s)) return '中';
  return '未知';
}

/** 解析模型回复成客户档案（还没核对联系方式） */
export function parseProfile(text: string): Profile {
  const data = extractJson(text);
  const root = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!root || typeof root !== 'object') throw new Error('大模型返回的内容无法识别');
  const contact = pick(root, ['contact', '联系方式']);
  const c = contact && typeof contact === 'object' && !Array.isArray(contact) ? (contact as Record<string, unknown>) : {};
  return {
    name: str(pick(root, ['name', 'customer', 'nickname', '客户称呼', '称呼', '昵称', '客户'])),
    phone: str(pick(root, ['phone', 'mobile', 'tel', '手机号', '手机', '电话']) ?? pick(c, ['phone', 'mobile', '手机号', '手机', '电话'])),
    wechat: str(pick(root, ['wechat', 'weixin', 'wx', '微信号', '微信']) ?? pick(c, ['wechat', 'weixin', '微信号', '微信'])),
    otherContact: str(pick(root, ['otherContact', 'other_contact', 'email', '其他联系方式', '邮箱']) ?? pick(c, ['other', 'email', 'qq', '邮箱'])),
    needs: str(pick(root, ['needs', 'need', 'requirement', 'demand', '需求', '客户需求'])),
    budget: str(pick(root, ['budget', '预算'])),
    intent: normIntent(pick(root, ['intent', 'intention', 'level', '意向', '意向等级'])),
    concerns: str(pick(root, ['concerns', 'concern', 'worries', '关注点', '顾虑', '关注点或顾虑'])),
    nextStep: str(pick(root, ['nextStep', 'next_step', 'followUp', 'follow_up', '跟进建议', '下次跟进建议', '下一步'])),
    evidence: str(pick(root, ['evidence', 'quotes', 'quote', '原文依据', '依据']), '｜'),
  };
}

/** 核对联系方式：去掉原文里没出现的号码，打码号码还原成完整号码。返回档案和被去掉的说明 */
export function verifyProfile(p: Profile, original: string): { profile: Profile; notes: string[] } {
  const notes: string[] = [];
  const phone = checkPhones(p.phone, original);
  if (p.phone && !phone) notes.push(`手机号「${p.phone}」在截图里没找到，已去掉`);
  const wechat = checkInText(p.wechat, original);
  if (p.wechat && !wechat) notes.push(`微信号「${p.wechat}」在截图里没找到，已去掉`);
  const otherContact = checkInText(p.otherContact, original);
  if (p.otherContact && !otherContact) notes.push(`联系方式「${p.otherContact}」在截图里没找到，已去掉`);
  return { profile: { ...p, phone, wechat, otherContact }, notes };
}

// ---------- 输出 ----------

export const HEADER = ['截图文件', '客户称呼', '意向', '预算', '需求', '关注点 / 顾虑', '手机号', '微信号', '其他联系方式', '跟进建议', '原文依据', '提示', '识别文字'];
export const WIDTHS = [22, 14, 8, 16, 36, 30, 15, 16, 18, 32, 40, 24, 50];

export function excelRow(file: string, p: Profile, notes: string[], chatText: string): string[] {
  return [file, p.name, p.intent, p.budget, p.needs, p.concerns, p.phone, p.wechat, p.otherContact, p.nextStep, p.evidence, notes.join('；'), chatText];
}

const INTENT_ORDER: Record<Intent, number> = { 高: 0, 中: 1, 低: 2, 未知: 3 };
/** 按意向从高到低排，同级保持原顺序 */
export const byIntent = <T extends { profile: Profile }>(items: T[]) =>
  items.map((x, i) => ({ x, i })).sort((a, b) => INTENT_ORDER[a.x.profile.intent] - INTENT_ORDER[b.x.profile.intent] || a.i - b.i).map(({ x }) => x);

export function summaryOf(p: Profile): string {
  return [p.name || '未识别称呼', `意向：${p.intent}`, p.budget ? `预算 ${p.budget}` : '未提预算'].join(' · ');
}

/** 显示和复制用的文字档案 */
export function profileText(p: Profile, notes: string[] = []): string {
  const lines: [string, string][] = [
    ['客户', p.name], ['意向', p.intent], ['预算', p.budget], ['需求', p.needs], ['关注点', p.concerns],
    ['手机号', p.phone], ['微信号', p.wechat], ['其他联系方式', p.otherContact], ['跟进建议', p.nextStep], ['原文依据', p.evidence],
  ];
  return [...lines.filter(([, v]) => v).map(([k, v]) => `${k}：${v}`), ...notes.map((n) => `提示：${n}`)].join('\n');
}

export function safeName(s: string): string {
  const cleaned = s.replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/^\.+/, '_').trim();
  return (cleaned || '未命名').slice(0, 80);
}

/** 大模型配置错误、密钥错、额度用完、暂停：后面的图也会失败，直接停 */
export const isFatalLlmError = (e: unknown) => /还没有设置大模型|（401|（403|（404|（429|已暂停/.test(e instanceof Error ? e.message : String(e));
