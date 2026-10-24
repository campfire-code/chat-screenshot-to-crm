// 单张截图的结果：左边是来源截图缩略图，右边是一张客户名片（称呼、意向、预算、需求、联系方式、跟进建议、客户原话）
import { Lightbulb, MessageSquareQuote, Phone, MessageCircle, AtSign, TriangleAlert } from 'lucide-react';
import type { InputItem, ItemResult } from '../kit/types';
import { fileSrc } from '../kit/platform';
import './tool.css';

/** 把「键：值」每行一项的档案文字拆开；「提示」可以有多行 */
function parse(text: string) {
  const f: Record<string, string> = {};
  const notes: string[] = [];
  for (const line of text.split('\n')) {
    const i = line.indexOf('：');
    if (i < 0) continue;
    const k = line.slice(0, i);
    const v = line.slice(i + 1).trim();
    if (k === '提示') notes.push(v);
    else f[k] = v;
  }
  return { f, notes };
}

const INTENT_CLASS: Record<string, string> = { 高: 'hi', 中: 'mid', 低: 'lo' };

export function ResultBody({ item, result }: { item: InputItem; result: ItemResult }) {
  const { f, notes } = parse(result.text ?? '');
  const src = result.preview ?? item.path;
  const name = f['客户'] || '未识别称呼';
  const intent = f['意向'] || '未知';
  const quotes = (f['原文依据'] ?? '').split(/[｜|]/).map((s) => s.trim()).filter(Boolean);
  const contacts: [typeof Phone, string, string][] = [];
  if (f['手机号']) contacts.push([Phone, '手机', f['手机号']]);
  if (f['微信号']) contacts.push([MessageCircle, '微信', f['微信号']]);
  if (f['其他联系方式']) contacts.push([AtSign, '其他', f['其他联系方式']]);
  return (
    <article className="cc-card">
      <header className="cc-head">
        <span className="cc-avatar" aria-hidden>{name.slice(0, 1)}</span>
        <div className="cc-who">
          <b className="cc-name">{name}</b>
          <span className="cc-src k-ellipsis" title={item.name}>来自 {item.name}</span>
        </div>
        <span className={`cc-intent ${INTENT_CLASS[intent] ?? 'un'}`}><small>意向</small>{intent}</span>
        {src && <img className="cc-shot" src={fileSrc(src)} alt="来源聊天截图" />}
      </header>
      <div className="cc-budget">
        <small>预算</small>
        <b className={f['预算'] ? '' : 'none'}>{f['预算'] || '客户没提预算'}</b>
      </div>
      <dl className="cc-fields">
        {f['需求'] && <><dt>需求</dt><dd>{f['需求']}</dd></>}
        {f['关注点'] && <><dt>关注点</dt><dd>{f['关注点']}</dd></>}
      </dl>
      {contacts.length > 0 && (
        <ul className="cc-contacts">
          {contacts.map(([I, k, v]) => <li key={k}><I size={14} aria-hidden /><span>{k}</span><b>{v}</b></li>)}
        </ul>
      )}
      {f['跟进建议'] && <p className="cc-next"><Lightbulb size={16} aria-hidden /><span><small>下一步</small>{f['跟进建议']}</span></p>}
      {quotes.length > 0 && (
        <div className="cc-quotes">
          <span className="cc-qt"><MessageSquareQuote size={13} aria-hidden />客户原话</span>
          {quotes.map((q, i) => <q key={i}>{q}</q>)}
        </div>
      )}
      {notes.map((n, i) => <p key={i} className="cc-note"><TriangleAlert size={14} aria-hidden />{n}</p>)}
    </article>
  );
}
