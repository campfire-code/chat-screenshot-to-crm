// 空状态：画出「聊天截图 → 客户名片」，写清三步和数据去向
import { Cpu, FileSpreadsheet, ShieldCheck, Upload } from 'lucide-react';
import './tool.css';

export function Empty({ hover }: { hover: boolean }) {
  return (
    <div className="cc-empty">
      <svg viewBox="0 0 440 190" role="img" aria-label="一张聊天截图整理成一张客户名片：称呼、意向高、预算、跟进建议">
        <rect x="10" y="10" width="140" height="170" rx="12" className="cc-ph" />
        <rect x="22" y="26" width="76" height="22" rx="6" className="cc-b-l" />
        <rect x="52" y="58" width="86" height="22" rx="6" className="cc-b-r" />
        <rect x="22" y="90" width="100" height="22" rx="6" className="cc-b-l" />
        <rect x="64" y="122" width="74" height="22" rx="6" className="cc-b-r" />
        <rect x="22" y="154" width="60" height="16" rx="6" className="cc-b-l" />
        <path d="M168 95 H210 M199 85 L211 95 L199 105" className="cc-arrow" />
        <text x="190" y="72" textAnchor="middle" className="cc-cap">识别并整理</text>
        <rect x="230" y="14" width="200" height="162" rx="14" className="cc-nc" />
        <circle cx="258" cy="46" r="16" className="cc-av" />
        <text x="258" y="52" textAnchor="middle" className="cc-avt">陈</text>
        <text x="284" y="44" className="cc-nm">陈女士</text>
        <rect x="284" y="52" width="52" height="8" rx="4" className="cc-line" />
        <rect x="364" y="32" width="50" height="26" rx="13" className="cc-hi" />
        <text x="389" y="50" textAnchor="middle" className="cc-hit">意向 高</text>
        <text x="244" y="88" className="cc-lb">预算</text>
        <text x="282" y="89" className="cc-big">3000 元左右</text>
        <rect x="244" y="104" width="172" height="8" rx="4" className="cc-line" />
        <rect x="244" y="118" width="130" height="8" rx="4" className="cc-line" />
        <rect x="244" y="138" width="172" height="28" rx="8" className="cc-tip" />
        <text x="256" y="156" className="cc-tipt">下一步：今天发报价单</text>
      </svg>
      <ul className="cc-steps">
        <li><ShieldCheck size={16} aria-hidden /><b>先确认同意</b><span>只处理已征得聊天对方同意的内容</span></li>
        <li><Cpu size={16} aria-hidden /><b>本机识别</b><span>文字识别在电脑上完成，截图不上传；整理时只发文字，手机号默认打码</span></li>
        <li><FileSpreadsheet size={16} aria-hidden /><b>导出档案</b><span>按意向从高到低排成一张 Excel</span></li>
      </ul>
      <h2 className="cc-title">{hover ? '松开鼠标，开始添加' : '把聊天截图拖进来'}</h2>
      <p className="cc-act"><Upload size={15} aria-hidden />支持 PNG、JPG、WebP、BMP，也可以拖入整个文件夹；一张截图整理成一份档案</p>
    </div>
  );
}
