import { Link } from '../api/client'
import { App } from '../api/client'
import { normalizeLocalPath } from '../lib/format'

export default function DetectedLinks({ links }: { links?: Link[] }) {
  if (!links || links.length === 0) return null
  return (
    <div className="td-links" data-role="links" style={{ display: 'block' }}>
      <div className="td-detail-label">検出されたリンク</div>
      <div>
        {links.map((link, i) =>
          link.type === 'url' ? (
            <div className="td-link-item" key={i}>
              <i className="bi bi-link-45deg" />{' '}
              <a href={link.value} onClick={(e) => { e.preventDefault(); App.OpenURL(link.value).catch(() => {}) }}>
                {link.value}
              </a>
            </div>
          ) : (
            <div className="td-link-item" key={i}>
              <i className="bi bi-folder2" />{' '}
              <span className="td-link-path" title="クリックして開く"
                onClick={() => App.OpenLocalPath(normalizeLocalPath(link.value)).catch(() => alert('パスを開けませんでした'))}>
                {link.value}
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
