// Actual Apple SF Symbols rendered by AppKit on macOS.
// Monochrome masks inherit the filter text color.
const symbol=(asset,name)=>'<span class="sf-symbol" aria-hidden="true" data-symbol="'+name+'" style="--sf-symbol:url(assets/sf-symbols/'+asset+'.png)"></span>';
export const statIcons={
 all:symbol('all','square.stack.3d.up'),
 active:symbol('active','play.circle'),
 blocked:symbol('blocked','pause.circle'),
 waiting:symbol('waiting','clock'),
 done:symbol('done','checkmark.circle')
};
