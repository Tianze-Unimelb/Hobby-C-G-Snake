/* 单机原型实现（简化、可玩）
 Controls:
 - Move: 鼠标移动或方向键 / WASD（当鼠标不动时）
 - Dash: 鼠标按下 或 空格
 - Skills: 1/2/3
*/

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const miniCanvas = document.getElementById('mini');
const miniCtx = miniCanvas.getContext('2d');
const hudLength = document.getElementById('lengthTag');
const dashBar = document.getElementById('dashBar');
const leaderboardEl = document.getElementById('leaderboard');
const genomeEl = document.getElementById('genome');
const skillsEl = document.getElementById('skills');
const skillPreview = document.getElementById('skillPreview');
const eventLog = document.getElementById('eventLog');

const W = canvas.width, H = canvas.height;
const MAP_W = 2200, MAP_H = 1400;
let viewX = (MAP_W - W)/2, viewY = (MAP_H - H)/2;

function logEvent(s){
    const d = document.createElement('div'); d.textContent = `[${new Date().toLocaleTimeString()}] ${s}`;
    eventLog.prepend(d); if(eventLog.childElementCount>200) eventLog.removeChild(eventLog.lastChild);
}

/* util */
function rand(min,max){return Math.random()*(max-min)+min;}
function randInt(a,b){return Math.floor(rand(a,b+1));}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

/* Entities */
class Food {
    constructor(x,y,value=1){
        this.x=x;this.y=y;this.v=value;
        this.size=4+Math.sqrt(value)*1.5;
        this.color=`hsl(${rand(0,360)},70%,60%)`;
    }

    draw(ctx,ox,oy){
        ctx.fillStyle=this.color;
        ctx.beginPath();
        ctx.arc(this.x-ox,this.y-oy,this.size,0,Math.PI*2);
        ctx.fill();
    }
}

class Script {
    constructor(id,name,x,y,color='#7dd3fc',isPlayer=false){
        this.id=id;this.name=name;this.x=x;this.y=y;this.color=color;this.isPlayer=isPlayer;
        this.parts=[]; this.length=30; this.heading=0; this.speedBase=1.9; this.kills=0; this.dead=false;
        this.dashCooldown=0; this.dashTime=0; this.dashEnergy=1.0; this.passive=null;
        this.activeSkills=[]; this.availableActives=[];
        for(let i=0;i<Math.floor(this.length);i++) this.parts.push({x:this.x - i*6,y:this.y});
    }

    setPassive(p){ this.passive=p; }

    update(dt, input){
        if(this.dead) return;
        // determine target
        let tx=this.x, ty=this.y;
        if(this.isPlayer && input.mouseMoved) { tx=input.mx; ty=input.my; }
        else if(!this.isPlayer && this.aiTarget){ tx=this.aiTarget.x; ty=this.aiTarget.y; }
        else { tx += rand(-1,1); ty += rand(-1,1); }
        const ang = Math.atan2(ty - this.y, tx - this.x);
        let diff = ang - this.heading; diff = ((diff+Math.PI)%(2*Math.PI))-Math.PI;
        const turnRate = 6*dt/(1+this.length/80);
        this.heading += diff*turnRate;
        let speed = this.speedBase * (1 + Math.min(0.5, this.length/200));
        if(this.dashTime>0){ speed *= 3; this.dashTime -= dt; }
        this.dashEnergy = clamp(this.dashEnergy + dt*0.05, 0, 1);
        this.x += Math.cos(this.heading)*speed*dt*60;
        this.y += Math.sin(this.heading)*speed*dt*60;
        this.x = clamp(this.x,10,MAP_W-10); this.y = clamp(this.y,10,MAP_H-10);
        this.parts.unshift({x:this.x,y:this.y});
        while(this.parts.length>Math.floor(this.length)) this.parts.pop();
        if(this.dashCooldown>0) this.dashCooldown = Math.max(0,this.dashCooldown-dt);
    }

    draw(ctx,ox,oy){
        if(this.dead) return;
        ctx.lineJoin='round'; ctx.lineCap='round';
        for(let i=1;i<this.parts.length;i++){
            const p0=this.parts[i-1], p1=this.parts[i];
            const t=i/this.parts.length;
            const w=Math.max(2,12*(1-t));
            ctx.globalAlpha = Math.max(0.2,1-t);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.moveTo(p0.x-ox,p0.y-oy);
            ctx.lineTo(p1.x-ox,p1.y-oy);
            ctx.stroke();
        }
        ctx.globalAlpha=1;
        ctx.beginPath();
        ctx.fillStyle='#fff';
        ctx.arc(this.x-ox,this.y-oy,8,0,Math.PI*2);
        ctx.fill();
        ctx.fillStyle='#000';
        ctx.beginPath();
        ctx.arc(this.x+6*Math.cos(this.heading)-ox,this.y+6*Math.sin(this.heading)-oy,2,0,Math.PI*2);
        ctx.fill();
        ctx.font='13px sans-serif';
        ctx.fillStyle='#e6eef8';
        ctx.fillText(this.name,this.x-ox+12,this.y-oy-10);
    }

    tryDash(){
        if(this.dashCooldown>0||this.dashEnergy<0.18||this.dead) return false;
        const cost=Math.max(4,Math.floor(this.length*0.04));
        if(this.length<=cost+6) return false;
        this.length-=cost;
        this.dashTime=0.22;
        this.dashCooldown=1.1;
        this.dashEnergy=0;
        return true;
    }

    grow(amount){
        if(this.passive==='scavenger') amount *= 1.12;
        this.length+=amount;
    }

    hitBy(other){
        if(this.passive==='harden' && !this._hardened){
            const loss=Math.min(this.length*0.45,40);
            this.length=Math.max(6,this.length-loss);
            this._hardened=true;
            setTimeout(()=>this._hardened=false,2200);
            logEvent(`${this.name} 硬化受击 丢失 ${Math.floor(loss)}`);
            return false;
        }
        this.dead=true;
        const total=Math.max(6,Math.floor(this.length/2));
        for(let i=0;i<total;i++) game.spawnFood(this.x+rand(-60,60), this.y+rand(-60,60), rand(0.6,2.8));
        logEvent(`${other.name} 击杀 ${this.name}（${Math.floor(this.length)}）`);
        other.kills++;
        other.grow(this.length*0.26 + rand(1,4));
        return true;
    }
}

/* Skills & Passives */
const PASSIVES = [
    {id:'scavenger', name:'食腐者', desc:'吞噬遗骸时获得额外能量'},
    {id:'efficient', name:'电光火石', desc:'冲刺消耗更少'},
    {id:'harden', name:'硬化皮肤', desc:'首次被击中不死而损失大量长度并短暂无敌'},
];

const ACTIVE_SKILLS = [
    {id:'ghost', name:'幽灵形态', desc:'短暂穿越身体', use(s){ s._ghost=true; setTimeout(()=>s._ghost=false,900); }},
    {id:'trap', name:'诱捕陷阱', desc:'放置减速陷阱', use(s){ game.spawnTrap(s.parts[Math.min(10,s.parts.length-1)].x, s.parts[Math.min(10,s.parts.length-1)].y); }},
    {id:'siphon', name:'能量虹吸', desc:'吸取周围能量点', use(s){ game.siphon(s); }},
];

/* Game manager */
const game = {
    foods:[], snakes:[], traps:[], time:0,

    init(){
        for(let i=0;i<380;i++) this.spawnFood(rand(0,MAP_W), rand(0,MAP_H), rand(0.6,3));
        const player = new Script('p','你', MAP_W/2, MAP_H/2, '#60a5fa', true);
        this.snakes.push(player);
        for(let i=0;i<7;i++){
            const s=new Script('b'+i,'Bot'+(i+1), rand(120,MAP_W-120), rand(120,MAP_H-120), `hsl(${i*40},70%,60%)`, false);
            s.length=randInt(18,70);
            if(Math.random()<0.35) s.passive=PASSIVES[randInt(0,PASSIVES.length-1)].id;
            this.snakes.push(s);
        }
        this.player = player;
    },

    spawnFood(x,y,v=1){
        this.foods.push(new Food(clamp(x,10,MAP_W-10), clamp(y,10,MAP_H-10), v));
    },

    spawnTrap(x,y){
        this.traps.push({x,y,age:0,life:10});
    },

    siphon(snake){
        let cnt=0;
        for(let i=this.foods.length-1;i>=0;i--){
            const f=this.foods[i];
            if(Math.hypot(f.x-snake.x,f.y-snake.y)<120){
                snake.grow(f.v*0.9+0.3);
                this.foods.splice(i,1);
                cnt++;
            }
        }
        logEvent(`${snake.name} 使用能量虹吸 吸取 ${cnt}`);
    },

    tick(dt){
        this.time+=dt;
        if(Math.floor(this.time)%20===0 && !this._tideTriggered){
            this._tideTriggered=true;
            this.triggerEvent('tide');
        } else if(Math.floor(this.time)%20!==0) this._tideTriggered=false;

        if(Math.random()<0.0008) this.triggerEvent('magnet');

        for(const s of this.snakes) s.update(dt, input);

        // simple AI choose target
        for(const s of this.snakes){
            if(!s.isPlayer && (!s.aiTarget || Math.random()<0.007)){
                let best=null,bd=99999;
                for(const f of this.foods){
                    const d=Math.hypot(f.x-s.x,f.y-s.y);
                    if(d<bd){bd=d;best=f;}
                }
                if(best) s.aiTarget={x:best.x+rand(-30,30), y:best.y+rand(-30,30)};
                if(Math.random()<0.001 && s.length>40 && s.dashEnergy>0.5) s.tryDash();
            }
        }

        // snake-food collisions
        for(const s of this.snakes){
            if(s.dead) continue;
            for(let i=this.foods.length-1;i>=0;i--){
                const f=this.foods[i];
                if(Math.hypot(f.x-s.x,f.y-s.y) < 12 + f.size){
                    s.grow(f.v);
                    this.foods.splice(i,1);
                }
            }
        }

        // head vs body collisions
        for(const s of this.snakes){
            if(s.dead) continue;
            for(const t of this.snakes){
                if(t.id===s.id || t.dead) continue;
                for(let i=6;i<t.parts.length;i++){
                    const p=t.parts[i];
                    const d=Math.hypot(p.x-s.x,p.y-s.y);
                    if(d<8 && !s._ghost && !t._ghost){
                        if(s.length < t.length*0.6){
                            s.hitBy(t);
                            break;
                        } else {
                            t.hitBy(s);
                        }
                    }
                }
            }
        }

        while(this.foods.length<320) this.spawnFood(rand(0,MAP_W), rand(0,MAP_H), rand(0.6,3));

        // traps
        for(let i=this.traps.length-1;i>=0;i--){
            const trap=this.traps[i];
            trap.age+=dt;
            if(trap.age>trap.life) this.traps.splice(i,1);
            else for(const s of this.snakes){
                if(s.dead) continue;
                if(Math.hypot(s.x-trap.x,s.y-trap.y)<28){
                    s.x-=Math.cos(s.heading)*1.2;
                    s.y-=Math.sin(s.heading)*1.2;
                }
            }
        }

        // revive simple
        for(const s of this.snakes){
            if(s.dead){
                if(!s._deadTime) s._deadTime=0;
                s._deadTime+=dt;
                if(s._deadTime>4.5){
                    s.dead=false;
                    s._deadTime=0;
                    s.length=Math.max(12, Math.floor(s.length*0.3));
                    s.x=rand(100,MAP_W-100);
                    s.y=rand(100,MAP_H-100);
                    s.parts=[];
                    for(let i=0;i<Math.floor(s.length);i++) s.parts.push({x:s.x - i*6, y:s.y});
                    logEvent(`${s.name} 重生`);
                }
            }
        }
    },

    triggerEvent(kind){
        if(kind==='tide'){
            const cx=rand(300,MAP_W-300), cy=rand(200,MAP_H-200);
            for(let i=0;i<90;i++) this.spawnFood(cx+rand(-160,160), cy+rand(-110,110), rand(1.6,5));
            logEvent('能量潮汐：高价值能量出现！');
        }
        else if(kind==='magnet'){
            const cx=rand(200,MAP_W-200), cy=rand(200,MAP_H-200);
            for(const s of this.snakes){
                const d=Math.hypot(s.x-cx,s.y-cy);
                if(d<280) s.heading += rand(-0.6,0.6)*0.1;
            }
            logEvent('磁场风暴：区域操控受扰！');
        }
    }
};

/* Input */
const input = {mx:MAP_W/2,my:MAP_H/2,mouseMoved:false,keys:{},mouseDown:false};

canvas.addEventListener('mousemove', e=>{
    const r=canvas.getBoundingClientRect();
    const cx=e.clientX-r.left, cy=e.clientY-r.top;
    input.mx = viewX + cx*(MAP_W/W);
    input.my = viewY + cy*(MAP_H/H);
    input.mouseMoved=true;
});

canvas.addEventListener('mousedown', ()=>{
    input.mouseDown=true;
    game.player.tryDash();
});

canvas.addEventListener('mouseup', ()=>{
    input.mouseDown=false;
});

window.addEventListener('keydown', e=>{
    input.keys[e.key]=true;
    if(e.key===' ') game.player.tryDash();
    if(e.key==='1'||e.key==='2'||e.key==='3'){
        const idx=parseInt(e.key)-1;
        if(game.player.activeSkills[idx]){
            const s=game.player.activeSkills[idx];
            const def=ACTIVE_SKILLS.find(a=>a.id===s.id);
            if(def) def.use(game.player);
            logEvent(`${game.player.name} 使用 ${s.name}`);
            game.player.activeSkills[idx]=null;
            renderActiveUI();
        }
    }
});

window.addEventListener('keyup', e=>{
    input.keys[e.key]=false;
});

/* UI populate */
function populateGenomeUI(){
    const container=document.getElementById('genomeSelect');
    PASSIVES.forEach(p=>{
        const b=document.createElement('button');
        b.textContent=p.name;
        b.title=p.desc;
        b.onclick=()=>{
            game.player.setPassive(p.id);
            genomeEl.textContent=p.name;
            logEvent(`选择被动基因：${p.name}`);
            Array.from(container.children).forEach(ch=>ch.disabled=true);
        };
        container.appendChild(b);
    });
}

function populateSkillPreview(){
    ACTIVE_SKILLS.forEach(s=>{
        const d=document.createElement('div');
        d.className='skill';
        d.innerHTML=`<strong>${s.name}</strong><div style="font-size:12px;color:${getComputedStyle(document.documentElement).getPropertyValue('--muted')};">${s.desc}</div>`;
        skillPreview.appendChild(d);
    });
}

function renderLeaderboard(){
    const arr=game.snakes.slice().sort((a,b)=>{
        if(a.kills!==b.kills) return b.kills-a.kills;
        return b.length-a.length;
    });
    leaderboardEl.innerHTML='';
    for(let i=0;i<Math.min(8,arr.length);i++){
        const s=arr[i];
        const el=document.createElement('div');
        el.className='item';
        el.innerHTML=`<div>${i+1}. ${s.name}</div><div style="text-align:right">${Math.floor(s.length)} / K:${s.kills}</div>`;
        leaderboardEl.appendChild(el);
    }
}

function renderActiveUI(){
    skillsEl.innerHTML='';
    for(let i=0;i<3;i++){
        const slot=document.createElement('div');
        slot.className='tag';
        slot.style.minWidth='60px';
        slot.textContent = game.player.activeSkills[i] ?
            game.player.activeSkills[i].name :
            (game.player.availableActives[i] ? '(可选)' : '-');
        skillsEl.appendChild(slot);
    }
}

function updateHUD(){
    hudLength.textContent = `长度: ${Math.floor(game.player.length)}`;
    dashBar.style.width = (game.player.dashEnergy*100) + '%';
}

/* rendering */
function drawBackground(ctx,ox,oy){
    ctx.fillStyle='#071226';
    ctx.fillRect(0,0,W,H);
    ctx.save();
    ctx.translate(-ox%80, -oy%80);
    ctx.globalAlpha=0.04;
    ctx.fillStyle='#fff';
    for(let x=0;x<MAP_W/80+4;x++)
        for(let y=0;y<MAP_H/80+4;y++){
            ctx.fillRect(x*80,y*80,1,1);
        }
    ctx.restore();
}

function render(){
    viewX += (game.player.x - W/2 - viewX)*0.14;
    viewY += (game.player.y - H/2 - viewY)*0.14;
    viewX = clamp(viewX,0,MAP_W-W);
    viewY = clamp(viewY,0,MAP_H-H);

    drawBackground(ctx, viewX, viewY);

    for(const f of game.foods) f.draw(ctx, viewX, viewY);

    for(const t of game.traps){
        ctx.fillStyle='rgba(255,80,60,0.85)';
        ctx.beginPath();
        ctx.arc(t.x-viewX,t.y-viewY,10,0,Math.PI*2);
        ctx.fill();
    }

    const arr=game.snakes.slice().sort((a,b)=>a.length-b.length);
    for(const s of arr) s.draw(ctx, viewX, viewY);

    // center crosshair
    ctx.strokeStyle='rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.moveTo(W/2-10,H/2);
    ctx.lineTo(W/2+10,H/2);
    ctx.moveTo(W/2,H/2-10);
    ctx.lineTo(W/2,H/2+10);
    ctx.stroke();

    renderMiniMap();
}

function renderMiniMap(){
    miniCtx.clearRect(0,0,miniCanvas.width,miniCanvas.height);
    miniCtx.fillStyle='rgba(8,12,20,0.9)';
    miniCtx.fillRect(0,0,miniCanvas.width,miniCanvas.height);

    const sx = miniCanvas.width / MAP_W, sy = miniCanvas.height / MAP_H;

    miniCtx.fillStyle='rgba(100,200,255,0.6)';
    for(let i=0;i<game.foods.length;i+=6){
        const f=game.foods[i];
        if(!f) continue;
        miniCtx.fillRect(f.x*sx, f.y*sy, 1.2,1.2);
    }

    for(const s of game.snakes){
        miniCtx.fillStyle = s.isPlayer ? '#60a5fa' : s.color;
        miniCtx.fillRect(s.x*sx-2, s.y*sy-2, 4,4);
    }

    miniCtx.strokeStyle='#ffffff22';
    miniCtx.strokeRect(viewX*sx, viewY*sy, W*sx, H*sy);
}

/* skill unlock simulation */
function checkSkillUnlock(){
    const thresholds = [60,140,300];
    for(const th of thresholds){
        if(game.player.length > th && !game.player['unlock_'+th]){
            game.player['unlock_'+th]=true;
            const pool=ACTIVE_SKILLS.slice();
            const opts=[];
            for(let i=0;i<3;i++){
                const idx=randInt(0,pool.length-1);
                opts.push(pool.splice(idx,1)[0]);
            }
            game.player.availableActives = opts.map(o=>({id:o.id,name:o.name,desc:o.desc}));
            logEvent(`主动技能可选：${opts.map(o=>o.name).join(' / ')}`);
            // 自动把第一项加入技能栏（原型）
            game.player.activeSkills = game.player.activeSkills.concat([{id:opts[0].id,name:opts[0].name,desc:opts[0].desc}]).slice(0,3);
            renderActiveUI();
        }
    }
    setTimeout(checkSkillUnlock,1200);
}

/* game loop */
game.init();
populateGenomeUI();
populateSkillPreview();
renderActiveUI();
checkSkillUnlock();
logEvent('单机原型启动 — 贪吃蛇：进化论');

let last = performance.now();
function loop(t){
    const dt = Math.min(0.033,(t-last)/1000);
    last=t;

    // fallback keyboard movement when mouse not moved
    if(!input.mouseMoved){
        let vx=0,vy=0;
        if(input.keys['ArrowUp'] || input.keys['w']) vy-=1;
        if(input.keys['ArrowDown'] || input.keys['s']) vy+=1;
        if(input.keys['ArrowLeft'] || input.keys['a']) vx-=1;
        if(input.keys['ArrowRight'] || input.keys['d']) vx+=1;
        if(vx!==0||vy!==0){
            const ang=Math.atan2(vy,vx);
            input.mx = game.player.x + Math.cos(ang)*200;
            input.my = game.player.y + Math.sin(ang)*200;
        }
    }

    game.tick(dt);
    render();
    updateHUD();
    renderLeaderboard();

    // reset mouseMoved flag so keyboard fallback can resume
    input.mouseMoved = false;
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* small helpful tips */
document.addEventListener('visibilitychange', ()=>{
    if(document.hidden) logEvent('页面不可见 — 游戏继续在后台运行（原型）');
});
