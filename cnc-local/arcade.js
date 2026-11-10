/* Browser-only diversions; no inventory or authentication access. */
(() => {
  const logo = document.querySelector('.brand-mark');
  logo.tabIndex = 0; logo.setAttribute('role','button'); logo.setAttribute('aria-label','CNC logo');
  let clicks = 0, last = 0, dialog, game = '2048', cells = [], score = 0, won = false, turn = 'X', first = null, locked = false, generation = 0;
  let solitaire = null;
  let moving = false, pending = [], animations = [];
  function stopMotion(){moving=false;pending=[];animations.forEach(a=>a.cancel());animations=[];}
  function node(tag,text,cls) { const n=document.createElement(tag); if(text!=null)n.textContent=text;if(cls)n.className=cls;return n; }
  function button(text,fn) {const b=node('button',text,'secondary');b.type='button';b.addEventListener('click',fn);return b;}
  function activate() {const now=Date.now();clicks=now-last>2000?1:clicks+1;last=now;if(clicks===5){clicks=0;open();}}
  logo.addEventListener('click',activate);
  logo.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}});
  function open() {
    if(!dialog){
      dialog=node('dialog',null,'arcade');dialog.setAttribute('aria-labelledby','arcadeTitle');
      const top=node('div',null,'arcade-toolbar'),title=node('h2','Break room');title.id='arcadeTitle';top.append(title,button('Close',()=>dialog.close()));
      const tabs=node('div',null,'arcade-toolbar');for(const name of ['2048','Tic-tac-toe','Memory','Solitaire']){const b=button(name,()=>{game=name;reset();});b.dataset.game=name;tabs.append(b);}
      const status=node('p');status.id='arcadeStatus';status.setAttribute('role','status');
      const board=node('div',null,'arcade-board');board.id='arcadeBoard';
      const controls=node('div',null,'arcade-controls');controls.id='arcadeControls';
      for(const [label,dir]of [['↑','up'],['←','left'],['↓','down'],['→','right']])controls.append(button(label,()=>move(dir)));
      dialog.append(top,tabs,status,board,controls,button('New game',reset));document.body.append(dialog);
      dialog.addEventListener('keydown',e=>{if(game==='2048'&&e.key.startsWith('Arrow')){e.preventDefault();e.stopPropagation();move(e.key.slice(5).toLowerCase());}});
      let touch=null;board.addEventListener('touchstart',e=>{touch=[e.changedTouches[0].clientX,e.changedTouches[0].clientY];},{passive:true});
      board.addEventListener('touchend',e=>{if(!touch||game!=='2048')return;const dx=e.changedTouches[0].clientX-touch[0],dy=e.changedTouches[0].clientY-touch[1];touch=null;if(Math.max(Math.abs(dx),Math.abs(dy))>25)move(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));},{passive:true});
      dialog.addEventListener('close',()=>{generation++;stopMotion();});
      dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
    }
    reset();dialog.showModal();
  }
  function spawn(){const empty=cells.map((v,i)=>v===0?i:-1).filter(i=>i>=0);if(empty.length)cells[empty[Math.floor(Math.random()*empty.length)]]=Math.random()<.9?2:4;}
  function reset(){generation++;stopMotion();score=0;won=false;turn='X';first=null;locked=false;
    if(game==='Solitaire'){solitaire=solitaire||window.cncSolitaire.create();solitaire.reset();}
    else if(game==='2048'){cells=Array(16).fill(0);spawn();spawn();}
    else if(game==='Tic-tac-toe')cells=Array(9).fill('');
    else {cells=Array.from({length:8},(_,i)=>i+1).flatMap(v=>[{value:v,up:false,matched:false},{value:v,up:false,matched:false}]);for(let i=cells.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cells[i],cells[j]]=[cells[j],cells[i]];}}
    render();
  }
  function move(dir){
    if(game!=='2048'||!['left','right','up','down'].includes(dir))return;
    if(moving){if(pending.length<3)pending.push(dir);return;}
    const before=cells.join(','),tracks=[],pops=[];
    for(let line=0;line<4;line++){
      const ids=Array.from({length:4},(_,k)=>dir==='left'?line*4+k:dir==='right'?line*4+3-k:dir==='up'?k*4+line:(3-k)*4+line);
      const values=ids.filter(i=>cells[i]).map(i=>({value:cells[i],from:i})),merged=[];
      for(let i=0;i<values.length;i++){
        const target=ids[merged.length],item=values[i];tracks.push({from:item.from,to:target});
        if(item.value===values[i+1]?.value){const value=item.value*2;merged.push(value);score+=value;tracks.push({from:values[++i].from,to:target});pops.push(target);}
        else merged.push(item.value);
      }
      ids.forEach((id,i)=>cells[id]=merged[i]||0);
    }
    if(before===cells.join(',')){const next=pending.shift();if(next)move(next);return;}
    const empty=cells.map((v,i)=>v===0?i:-1).filter(i=>i>=0);spawn();
    const spawned=empty.find(i=>cells[i]);if(spawned!==undefined)pops.push(spawned);
    const board=dialog?.open?document.getElementById('arcadeBoard'):null;
    const reduced=board&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!board||reduced){render();return;}
    moving=true;const current=generation,tiles=Array.from(board.children);
    animations=tracks.filter(t=>t.from!==t.to).map(t=>{
      const tile=tiles[t.from],target=tiles[t.to];tile.style.zIndex='2';
      return tile.animate([{transform:'translate(0, 0)'},{transform:'translate('+(target.offsetLeft-tile.offsetLeft)+'px, '+(target.offsetTop-tile.offsetTop)+'px)'}],{duration:135,easing:'cubic-bezier(.2,.7,.3,1)',fill:'forwards'});
    });
    Promise.all(animations.map(a=>a.finished.catch(()=>{}))).then(()=>{
      if(current!==generation)return;
      animations.forEach(a=>a.cancel());animations=[];render();
      for(const i of pops){const tile=board.children[i];animations.push(tile.animate([{transform:'scale(.85)'},{transform:'scale(1.08)',offset:.65},{transform:'scale(1)'}],{duration:150,easing:'ease-out'}));}
      moving=false;const next=pending.shift();if(next)requestAnimationFrame(()=>{if(current===generation)move(next);});
    });
  }
  function result(){for(const [a,b,c]of [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]])if(cells[a]&&cells[a]===cells[b]&&cells[a]===cells[c])return cells[a]+' wins!';return cells.every(Boolean)?'Draw!':'';}
  function play(i){if(game==='Tic-tac-toe'){if(cells[i]||result())return;cells[i]=turn;turn=turn==='X'?'O':'X';render();return;}
    if(locked||cells[i].up||cells[i].matched)return;cells[i].up=true;
    if(first===null){first=i;render();return;}
    const previous=first;first=null;score++;
    if(cells[previous].value===cells[i].value){cells[previous].matched=cells[i].matched=true;render();}
    else {locked=true;render();const current=generation;setTimeout(()=>{if(current!==generation)return;cells[previous].up=cells[i].up=false;locked=false;render();},750);}
  }
  function render(){const board=document.getElementById('arcadeBoard'),status=document.getElementById('arcadeStatus');board.replaceChildren();board.classList.remove('solitaire-board');board.style.setProperty('--arcade-columns',game==='Tic-tac-toe'?3:4);document.getElementById('arcadeControls').hidden=game!=='2048';
    dialog.querySelectorAll('[data-game]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.game===game)));
    if(game==='Solitaire'){solitaire.render(board,status);}
    else if(game==='2048'){
      const stuck=cells.every(Boolean)&&cells.every((v,i)=>(i%4===3||v!==cells[i+1])&&(i>=12||v!==cells[i+4]));
      won=won||cells.some(v=>v>=2048);status.textContent='Score: '+score+' · '+(stuck?'Game over. Start a new game.':won?'2048! Keep going.':'Merge tiles with arrow keys, swipes, or the buttons.');
      cells.forEach(v=>{const tile=node('div',v||'', 'arcade-tile');tile.dataset.value=v;tile.setAttribute('aria-label',v?String(v):'Empty');board.append(tile);});
    }else if(game==='Tic-tac-toe'){
      const end=result();status.textContent=end||turn+' to play · Two players';cells.forEach((v,i)=>{const b=button(v||'·',()=>play(i));b.classList.add('arcade-tile');b.disabled=Boolean(v||end);b.setAttribute('aria-label','Square '+(i+1)+': '+(v||'empty'));board.append(b);});
    }else {status.textContent=cells.every(c=>c.matched)?'All pairs found in '+score+' turns!':'Find matching pairs · Turns: '+score;
      cells.forEach((c,i)=>{const b=button(c.up||c.matched?String(c.value):'?',()=>play(i));b.classList.add('arcade-tile');b.disabled=c.matched||locked;b.setAttribute('aria-label','Card '+(i+1)+': '+(c.up||c.matched?c.value:'hidden'));board.append(b);});}
  }
})();
