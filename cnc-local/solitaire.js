/* Klondike draw-one. Standalone state, independent of shop records. */
(() => {
  const suits=['♠','♥','♣','♦'];
  const red=card=>card.suit===1||card.suit===3;
  const label=card=>(['','A','2','3','4','5','6','7','8','9','10','J','Q','K'][card.rank])+suits[card.suit];
  function deal(random=Math.random){
    const deck=suits.flatMap((_,suit)=>Array.from({length:13},(_,i)=>({suit,rank:i+1,up:false})));
    for(let i=deck.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
    const state={stock:[],waste:[],piles:Array.from({length:7},()=>[]),foundations:Array.from({length:4},()=>[]),moves:0};
    for(let i=0;i<7;i++){for(let j=0;j<=i;j++)state.piles[i].push(deck.pop());state.piles[i][i].up=true;}state.stock=deck;return state;
  }
  function draw(state){
    if(state.stock.length){const card=state.stock.pop();card.up=true;state.waste.push(card);state.moves++;return true;}
    if(state.waste.length){state.stock=state.waste.reverse();state.waste=[];state.stock.forEach(c=>c.up=false);state.moves++;return true;}return false;
  }
  function source(state,from){return from?.kind==='waste'?state.waste:from?.kind==='foundation'?state.foundations[from.index]:from?.kind==='pile'?state.piles[from.index]:null;}
  function move(state,from,to,apply=true){
    const src=source(state,from),dest=source(state,to);if(!src||!dest||src===dest||!['pile','foundation'].includes(to.kind))return false;
    const at=from.kind==='pile'?from.at:src.length-1;
    if(!Number.isInteger(at)||at<0||at>=src.length)return false;
    const cards=src.slice(at);if(cards.some(c=>!c.up))return false;
    for(let i=1;i<cards.length;i++)if(cards[i-1].rank!==cards[i].rank+1||red(cards[i-1])===red(cards[i]))return false;
    const card=cards[0],top=dest[dest.length-1];
    if(to.kind==='foundation'){if(cards.length!==1||card.suit!==to.index||card.rank!==dest.length+1)return false;}
    else if(top?(!top.up||top.rank!==card.rank+1||red(top)===red(card)):card.rank!==13)return false;
    if(!apply)return true;
    dest.push(...src.splice(at));if(from.kind==='pile'&&src.length)src[src.length-1].up=true;state.moves++;return true;
  }
  function autoMove(state,from){
    const targets=[];
    if(from.kind!=='foundation')for(let index=0;index<4;index++)targets.push({kind:'foundation',index});
    // Prefer occupied columns. Moving a whole king column to an empty column adds nothing.
    for(const occupied of [true,false])for(let index=0;index<7;index++){
      if(Boolean(state.piles[index].length)!==occupied)continue;
      if(!occupied&&from.kind==='pile'&&from.at===0)continue;
      targets.push({kind:'pile',index});
    }
    for(const target of targets)if(move(state,from,target,false)){move(state,from,target);return target;}
    return null;
  }
  function create(){
    let state=deal(),selected=null,board,status,feedback='',automatic=true,history=[];
    const snapshot=()=>JSON.stringify(state);
    function remember(before){history.push(before);if(history.length>200)history.shift();}
    function commit(from,to){const before=snapshot();if(!move(state,from,to))return false;remember(before);return true;}
    function element(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
    function button(text,fn,cls){const n=element('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;}
    function redraw(){render(board,status);}
    function choose(from){
      if(selected&&commit(selected,{kind:from.kind,index:from.index})){selected=null;feedback='Card moved.';redraw();return;}
      const cards=source(state,from),at=from.kind==='pile'?from.at:cards.length-1,card=cards[at];
      if(!card?.up){selected=null;feedback='Select a face-up card first.';redraw();return;}
      if(automatic){const before=snapshot(),target=autoMove(state,{...from,at});if(target){remember(before);selected=null;feedback=label(card)+' moved automatically.';redraw();return;}}
      if(selected?.kind===from.kind&&selected.index===from.index&&selected.at===at){selected=null;feedback='Selection cleared.';}
      else {selected={...from,at};feedback=automatic?'No automatic move for '+label(card)+'. Choose another card or destination.':label(card)+' selected. Choose a destination.';}redraw();
    }
    function destination(kind,index){if(selected&&commit(selected,{kind,index})){selected=null;feedback='Card moved.';}else feedback=selected?'That move is not allowed.':'Select a card to move.';redraw();}
    function cardButton(card,from,top){
      const b=button(card.up?label(card):'',()=>choose(from),'sol-card'+(card.up?'':' sol-back')+(red(card)?' sol-red':''));
      b.style.top=top+'px';b.disabled=!card.up;b.setAttribute('aria-label',card.up?label(card):'Face-down card');
      const chosen=selected?.kind===from.kind&&selected.index===from.index&&from.at>=selected.at;b.classList.toggle('sol-selected',Boolean(chosen));b.setAttribute('aria-pressed',String(Boolean(chosen)));return b;
    }
    function render(target,message){board=target;status=message;board.replaceChildren();board.classList.add('solitaire-board');
      const won=state.foundations.every(p=>p.length===13);status.textContent=won?'You won in '+state.moves+' moves!':'Moves: '+state.moves+' · '+(feedback||(automatic?'Easy moves: tap a card to move it automatically.':'Select a face-up card and its destination.'));
      const tools=element('div',null,'sol-tools'),toggle=element('label'),check=element('input');check.type='checkbox';check.checked=automatic;check.addEventListener('change',()=>{automatic=check.checked;selected=null;feedback='';redraw();});toggle.append(check,document.createTextNode(' Easy moves'));const undo=button('Undo',()=>{if(!history.length)return;state=JSON.parse(history.pop());selected=null;feedback='Move undone.';redraw();},'secondary small');undo.disabled=!history.length;tools.append(toggle,undo);
      const top=element('div',null,'sol-top'),stock=button(state.stock.length?'Draw ('+state.stock.length+')':'Recycle',()=>{selected=null;const before=snapshot();if(draw(state)){remember(before);feedback='';}else feedback='No cards to draw.';redraw();},'sol-slot sol-stock');stock.disabled=!state.stock.length&&!state.waste.length;top.append(stock);
      const waste=element('div',null,'sol-slot');waste.setAttribute('aria-label','Waste pile');if(state.waste.length)waste.append(cardButton(state.waste.at(-1),{kind:'waste',index:0,at:state.waste.length-1},0));else waste.textContent='Waste';top.append(waste,element('div'));
      for(let i=0;i<4;i++){const slot=element('div',null,'sol-slot');slot.append(button(state.foundations[i].length?label(state.foundations[i].at(-1)):suits[i],()=>{if(selected)destination('foundation',i);else if(state.foundations[i].length)choose({kind:'foundation',index:i,at:state.foundations[i].length-1});},'sol-foundation'+(i%2?' sol-red':'')));slot.firstChild.setAttribute('aria-label',suits[i]+' foundation: '+state.foundations[i].length+' cards');top.append(slot);}
      const piles=element('div',null,'sol-piles');state.piles.forEach((pile,index)=>{
        const column=element('div',null,'sol-column');column.style.height=Math.max(70,(pile.length-1)*22+70)+'px';column.append(button('K',()=>destination('pile',index),'sol-slot sol-empty'));column.firstChild.setAttribute('aria-label','Empty column '+(index+1));column.firstChild.hidden=pile.length>0;
        pile.forEach((card,at)=>column.append(cardButton(card,{kind:'pile',index,at},at*22)));piles.append(column);
      });board.append(tools,top,piles);
    }
    return {reset(){state=deal();selected=null;feedback='';history=[];},render};
  }
  window.cncSolitaire={deal,draw,move,autoMove,create};
})();
