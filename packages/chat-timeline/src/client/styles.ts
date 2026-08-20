export const STYLE_ID = 'dsh-chat-timeline-style'

/** Narrow-viewport breakpoint: the rail hides below this width so it never occludes the conversation on phones. */
export const MOBILE_MAX_WIDTH = 767

export const cssText = `
.dsct_nav{-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;z-index:100;align-items:center;width:34px;height:300px;display:flex;position:fixed;top:50%;bottom:50%;right:16px;transform:translateY(-50%);pointer-events:auto}
.dsct_bg{background-color:transparent;border-radius:16px;width:34px;height:calc(100% - 8px);max-height:calc(100% - 8px);position:absolute;top:50%;right:0;transform:translateY(-50%);transition:opacity .2s ease;pointer-events:none}
.dsct_bg.dsct_bghide{opacity:0}
.dsct_wrap{width:-moz-fit-content;width:fit-content;max-width:240px;max-height:100%;border:1px solid transparent;border-radius:16px;flex-direction:column;align-items:stretch;transition:width .22s cubic-bezier(0.4,0,0.2,1),background .2s ease,box-shadow .2s ease,border-color .2s ease;display:flex;position:absolute;right:0;overflow:hidden;box-sizing:border-box;background:transparent;pointer-events:none}
.dsct_wrap.dsct_max{width:240px}
.dsct_wrap.dsct_show{pointer-events:auto;background:rgba(255,255,255,.94);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border:1px solid rgba(0,0,0,.08);box-shadow:0 10px 30px rgba(0,0,0,.08),0 2px 8px rgba(0,0,0,.04)}
body[data-ds-dark-theme] .dsct_wrap.dsct_show,[data-theme='dark'] .dsct_wrap.dsct_show,.dark .dsct_wrap.dsct_show{background:rgba(28,28,32,.95);border:1px solid rgba(255,255,255,.08);box-shadow:0 10px 30px rgba(0,0,0,.45),0 2px 8px rgba(0,0,0,.25)}
.dsct_page{max-height:250px;padding:15px 0 15px 24px;box-sizing:border-box;overscroll-behavior:contain;flex-direction:column;align-items:flex-end;display:flex;position:relative;width:100%;overflow:hidden}
.dsct_wrap.dsct_show .dsct_page{overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
body[data-ds-dark-theme] .dsct_wrap.dsct_show .dsct_page,[data-theme='dark'] .dsct_wrap.dsct_show .dsct_page,.dark .dsct_wrap.dsct_show .dsct_page{scrollbar-color:rgba(255,255,255,.25) transparent}
.dsct_page::-webkit-scrollbar{width:4px}
.dsct_page::-webkit-scrollbar-track{background:transparent}
.dsct_page::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px}
.dsct_page::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.35)}
body[data-ds-dark-theme] .dsct_page::-webkit-scrollbar-thumb,[data-theme='dark'] .dsct_page::-webkit-scrollbar-thumb,.dark .dsct_page::-webkit-scrollbar-thumb{background:rgba(255,255,255,.25)}
body[data-ds-dark-theme] .dsct_page::-webkit-scrollbar-thumb:hover,[data-theme='dark'] .dsct_page::-webkit-scrollbar-thumb:hover,.dark .dsct_page::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.45)}
.dsct_item{cursor:pointer;height:30px;min-height:30px;justify-content:flex-end;align-items:center;width:calc(100% - 6px);margin-right:8px;line-height:20px;display:flex;background:none;border:none;font:inherit;text-align:right;box-sizing:border-box;padding:0;transition:color .15s ease;flex-shrink:0;color:rgba(0,0,0,.65)}
.dsct_item:hover{color:rgba(0,0,0,.95)}
.dsct_item.dsct_active{color:var(--dsw-alias-state-business-primary,#4d6bfe)}
body[data-ds-dark-theme] .dsct_item,[data-theme='dark'] .dsct_item,.dark .dsct_item{color:rgba(255,255,255,.65)}
body[data-ds-dark-theme] .dsct_item:hover,[data-theme='dark'] .dsct_item:hover,.dark .dsct_item:hover{color:rgba(255,255,255,.95)}
.dsct_title{font-size:13px;line-height:20px;text-overflow:ellipsis;white-space:nowrap;opacity:0;margin-right:12px;flex:1;min-width:0;text-align:right;overflow:hidden;transition:opacity .12s ease,color .15s ease;color:inherit}
.dsct_title.dsct_show{opacity:1}
.dsct_item.dsct_active .dsct_title{color:var(--dsw-alias-state-business-primary,#4d6bfe);font-weight:500}
.dsct_ind{flex-shrink:0;justify-content:center;align-items:center;width:16px;height:20px;display:flex}
.dsct_line{background-color:rgba(0,0,0,.16);border-radius:4px;flex-shrink:0;width:8px;height:2px;transition:background-color .2s ease,transform .2s ease}
.dsct_item:hover .dsct_line{background-color:rgba(0,0,0,.85)}
.dsct_item.dsct_active .dsct_line{background-color:var(--dsw-alias-state-business-primary,#4d6bfe);transform-origin:50%;transform:scale(1.5)}
.dsct_jumperr{font-size:12px;line-height:16px;color:rgba(200,60,60,.9);text-align:right;margin-right:12px;padding:2px 0 4px;flex-shrink:0}
body[data-ds-dark-theme] .dsct_jumperr,[data-theme='dark'] .dsct_jumperr,.dark .dsct_jumperr{color:rgba(255,120,120,.9)}
body[data-ds-dark-theme] .dsct_line,[data-theme='dark'] .dsct_line,.dark .dsct_line{background-color:rgba(255,255,255,.2)}
body[data-ds-dark-theme] .dsct_item:hover .dsct_line,[data-theme='dark'] .dsct_item:hover .dsct_line,.dark .dsct_item:hover .dsct_line{background-color:rgba(255,255,255,.9)}
body[data-ds-dark-theme] .dsct_item.dsct_active .dsct_line,[data-theme='dark'] .dsct_item.dsct_active .dsct_line,.dark .dsct_item.dsct_active .dsct_line{background-color:var(--dsw-alias-state-business-primary,#4d6bfe)}
@media (prefers-reduced-motion:reduce){.dsct_nav,.dsct_wrap,.dsct_title,.dsct_line{transition:none}}
@media (max-width:${MOBILE_MAX_WIDTH}px){.dsct_nav{display:none}}
`

export const styles = {
  nav: 'dsct_nav',
  bg: 'dsct_bg',
  bgHide: 'dsct_bghide',
  wrap: 'dsct_wrap',
  wrapMax: 'dsct_max',
  wrapShow: 'dsct_show',
  page: 'dsct_page',
  item: 'dsct_item',
  itemActive: 'dsct_active',
  title: 'dsct_title',
  titleShow: 'dsct_show',
  ind: 'dsct_ind',
  line: 'dsct_line',
  jumpError: 'dsct_jumperr',
} as const

/**
 * Install the stylesheet once per page. The disposer removes only the node
 * this call created; a second mount shares the existing node and returns a
 * no-op disposer, so one mount's teardown cannot strip a sibling's stylesheet.
 */
export function adoptStyles(): () => void {
  if (document.getElementById(STYLE_ID) !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = cssText
  document.head.appendChild(style)
  return () => {
    if (style.isConnected) style.remove()
  }
}
