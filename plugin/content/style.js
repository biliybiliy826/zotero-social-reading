var ZSRStyle = {
  toolbar: `
    .zsr-toolbar { display: inline-flex; align-items: center; gap: 5px; margin: 0 7px; font: 12px system-ui, sans-serif; }
    .zsr-toolbar-button, .zsr-selection-button { border: 1px solid #bcc8d4; background: #f7f9fb; color: #314254; border-radius: 5px; padding: 4px 7px; cursor: pointer; white-space: nowrap; }
    .zsr-toolbar-button:hover, .zsr-selection-button:hover { background: #e9f1fa; }
    .zsr-toolbar-button.zsr-active { background: #dcecfb; border-color: #3d8ccc; color: #174d7b; }
    .zsr-toolbar-button:disabled { opacity: .55; cursor: wait; }
    .zsr-toolbar-button[hidden] { display: none; }
    .zsr-status { color: #5b6875; font: 11px system-ui, sans-serif; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .zsr-status.zsr-error, .zsr-error-message { color: #b42318; }
    .zsr-selection-button { margin: 3px; font-size: 12px; }
    .zsr-composer { position: fixed; top: 82px; right: 28px; z-index: 12000; width: 320px; max-height: 70vh; overflow: auto; box-sizing: border-box; border: 1px solid #b9c8d9; border-radius: 10px; background: #fff; color: #213547; box-shadow: 0 8px 32px #0003; padding: 15px; font: 13px/1.5 system-ui, sans-serif; }
    .zsr-composer blockquote { margin: 12px 0; padding: 7px 10px; border-left: 3px solid #8aa9c9; background: #f2f6fa; max-height: 90px; overflow: auto; }
    .zsr-composer textarea { display: block; box-sizing: border-box; width: 100%; min-height: 88px; resize: vertical; padding: 8px; border: 1px solid #aebccc; border-radius: 6px; font: inherit; }
    .zsr-composer form button, .zsr-popover form button, .zsr-popover > button { margin-top: 10px; background: #246ab0; color: white; border: 0; border-radius: 6px; padding: 7px 11px; cursor: pointer; font: inherit; }
    .zsr-composer button:disabled, .zsr-popover button:disabled { opacity: .5; }
    .zsr-close { float: right; background: transparent !important; color: inherit !important; border: 0 !important; padding: 0 4px !important; font-size: 20px !important; line-height: 1 !important; cursor: pointer; }
  `,
  page: `
    .page > .zsr-overlay { position: absolute; inset: 0; z-index: 12; pointer-events: none; overflow: visible; }
    .zsr-line { position: absolute; box-sizing: border-box; background: rgba(40, 122, 202, .11); border-bottom: 1px dashed rgba(31, 100, 164, .75); pointer-events: none; }
    .zsr-draft-line { background: rgba(132, 73, 174, .12); border-bottom-color: #8854b8; }
    .zsr-marker { position: absolute; z-index: 2; pointer-events: auto; cursor: pointer; border: 1px solid #4785b8; border-radius: 9px; background: #e6f3fd; color: #16517f; padding: 1px 4px; min-width: 20px; height: 18px; font: bold 10px/14px system-ui, sans-serif; box-shadow: 0 1px 4px #0003; white-space: nowrap; }
    .zsr-marker:hover { background: #cce9ff; }
    .zsr-draft-marker { border-color: #8b62b0; background: #f1e9f8; color: #64348e; }
    .zsr-popover { position: fixed; z-index: 20000; box-sizing: border-box; width: 310px; max-height: min(420px, 75vh); overflow: auto; border: 1px solid #adbed1; border-radius: 10px; background: #fff; color: #213547; box-shadow: 0 8px 32px #0004; padding: 14px; font: 13px/1.5 system-ui, sans-serif; }
    .zsr-popover blockquote { margin: 10px 0; padding: 7px 9px; border-left: 3px solid #8aa9c9; background: #f3f7fb; max-height: 90px; overflow: auto; }
    .zsr-popover p { margin: 7px 0; }
    .zsr-popover textarea { display: block; box-sizing: border-box; width: 100%; height: 56px; resize: vertical; border: 1px solid #aebccc; border-radius: 6px; padding: 6px; font: inherit; }
    .zsr-popover .zsr-replies { border-top: 1px solid #dde4ec; margin-top: 10px; padding-top: 4px; max-height: 100px; overflow: auto; }
    .zsr-popover form button, .zsr-popover > button { margin-top: 8px; background: #246ab0; color: #fff; border: 0; border-radius: 6px; padding: 6px 10px; cursor: pointer; font: inherit; }
    .zsr-popover button:disabled { opacity: .5; }
    .zsr-popover .zsr-close { float: right; border: 0; background: transparent; color: #4d5a67; font-size: 19px; padding: 0 3px; cursor: pointer; }
    .zsr-error-message { color: #b42318; }
  `,
};
