/* ============================================================
   SECOND BRAIN — app.js
   34-Feature Full System
   ============================================================ */

// ===== DATA STORE =====
const DB_KEY = 'secondbrain_v2';
const defaultData = () => ({
    inbox:[],tasks:[],projects:[],areas:[],notes:[],habits:[],journals:[],
    srCards:[],books:[],finances:[],okrs:[],visions:[],reviews:[],
    health:{weight:[],sleep:[],steps:[],water:{}},
    timeEntries:[],heatmap:{},
    rituals:{morning:{},evening:{}},
    lifewheel:{career:5,finance:5,health:5,relationships:5,fun:5,environment:5,growth:5,contribution:5},
    xp:0,level:1,streak:0,lastActive:'',
    achievements:{},
    pin:'',pinEnabled:false,
    theme:'midnight',lang:'th',
    undoStack:[],
    trash:[],
    notificationsEnabled:false,
    autoSyncEnabled:true,
    lastModified: new Date().toISOString()
});

let D = loadData();
function loadData(){ try{ const d = JSON.parse(localStorage.getItem(DB_KEY)); return d ? {...defaultData(),...d} : defaultData(); }catch(e){ return defaultData(); }}
function save(){ D.lastModified = new Date().toISOString(); localStorage.setItem(DB_KEY, JSON.stringify(D)); }
function id(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function today(){ return new Date().toISOString().slice(0,10); }
function fmt(n){ return Number(n).toLocaleString(); }
function el(id){ return document.getElementById(id); }

// ===== UNDO SYSTEM =====
let undoData = null;
function pushUndo(label, snapshot){
    undoData = { label, data: snapshot };
    el('undo-text').textContent = label;
    el('undo-bar').classList.add('show');
    setTimeout(()=> el('undo-bar').classList.remove('show'), 5000);
}
function undoAction(){
    if(!undoData) return;
    Object.assign(D, JSON.parse(undoData.data));
    save(); renderAll();
    el('undo-bar').classList.remove('show');
    undoData = null;
}

// ===== PIN LOCK =====
let pinBuffer = '';
function pinInput(n){
    pinBuffer += n;
    updatePinDots();
    if(pinBuffer.length === 4){
        if(!D.pinEnabled || pinBuffer === D.pin){ unlockApp(); }
        else { document.querySelectorAll('.pin-dot').forEach(d=>d.classList.add('error')); setTimeout(()=>{ pinBuffer=''; updatePinDots(); },500); }
    }
}
function pinClear(){ pinBuffer = pinBuffer.slice(0,-1); updatePinDots(); }
function pinSkip(){ if(!D.pinEnabled) unlockApp(); }
function updatePinDots(){ document.querySelectorAll('.pin-dot').forEach((d,i)=>{ d.classList.remove('filled','error'); if(i<pinBuffer.length) d.classList.add('filled'); }); }
function unlockApp(){ el('pin-lock').classList.add('hidden'); el('app').style.display='flex'; renderAll(); showDailyQuote(); }

// ===== NAVIGATION =====
function nav(page){
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    const pg = el('page-'+page); if(pg) pg.classList.add('active');
    const ni = document.querySelector(`.nav-item[data-page="${page}"]`); if(ni) ni.classList.add('active');
    if(page==='graph') renderGraph();
    if(page==='analytics') renderAnalytics();
    if(page==='heatmap') renderHeatmap();
    if(page==='lifewheel') renderLifeWheel();
    if(page==='achievements') renderAchievements();
    if(page==='templates') renderTemplates();
    if(page==='trash') renderTrash();
    if(page==='cloudsync') { updateSyncUI(); updateAutoSyncUI(); updateNotifUI(); }
}
document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('.nav-item').forEach(item=>{
        item.addEventListener('click',()=> nav(item.dataset.page));
    });
    initApp();
});

// ===== INIT =====
function initApp(){
    // Check PIN
    if(D.pinEnabled && D.pin){ el('pin-lock').classList.remove('hidden'); }
    else { unlockApp(); }
    // Theme
    document.documentElement.setAttribute('data-theme', D.theme || 'midnight');
    // Greeting
    updateGreeting();
    // Streak
    checkStreak();
    // Water cups
    renderWaterCups();
    // Rituals
    renderRituals();
    // Life wheel inputs
    renderLifeWheelInputs();
}

function updateGreeting(){
    const h = new Date().getHours();
    const g = h<12?'สวัสดีตอนเช้า':h<17?'สวัสดีตอนบ่าย':'สวัสดีตอนเย็น';
    el('greeting-text').textContent = g + ' 👋';
    const opts = {weekday:'long',year:'numeric',month:'long',day:'numeric'};
    el('date-text').textContent = new Date().toLocaleDateString('th-TH',opts);
}

function checkStreak(){
    const t = today();
    if(D.lastActive && D.lastActive !== t){
        const last = new Date(D.lastActive);
        const now = new Date(t);
        const diff = Math.floor((now-last)/(1000*60*60*24));
        if(diff > 1) D.streak = 0;
    }
    if(D.lastActive !== t){ D.streak++; D.lastActive = t; save(); }
}

// ===== RENDER ALL =====
function renderAll(){
    renderInbox(); renderTasks(); renderKanban(); renderEisenhower();
    renderProjects(); renderAreas(); renderResources(); renderArchive();
    renderNotes(); renderSRCards(); renderBooks();
    renderJournals(); renderHabits(); renderRituals();
    renderHealth(); renderFinance(); renderTimeHistory();
    renderOKRs(); renderVisions(); renderReviewHistory();
    updateDashboard(); updateXPBar();
}

// ===== XP & GAMIFICATION =====
const LEVELS = [{name:'Beginner',xp:0},{name:'Apprentice',xp:100},{name:'Scholar',xp:300},{name:'Expert',xp:600},{name:'Master',xp:1000},{name:'Grandmaster',xp:1500},{name:'Legend',xp:2500},{name:'Mythic',xp:4000},{name:'Transcendent',xp:6000},{name:'Omniscient',xp:10000}];
function addXP(amount){
    D.xp += amount;
    // Level up check
    for(let i=LEVELS.length-1;i>=0;i--){ if(D.xp >= LEVELS[i].xp){ D.level = i+1; break; } }
    save(); updateXPBar(); showXPPopup(amount);
    checkAchievements();
}
function updateXPBar(){
    const curr = LEVELS[D.level-1] || LEVELS[0];
    const next = LEVELS[D.level] || {xp:curr.xp+1000};
    const progress = ((D.xp - curr.xp)/(next.xp - curr.xp))*100;
    el('xp-bar').style.width = Math.min(progress,100)+'%';
    el('xp-level-text').textContent = `Lv.${D.level} ${curr.name}`;
    el('xp-text').textContent = `${D.xp}/${next.xp} XP`;
    el('s-level').textContent = D.level;
    el('s-level-name').textContent = curr.name;
}
function showXPPopup(val){
    el('xp-popup-val').textContent = val;
    const p = el('xp-popup'); p.classList.remove('show');
    void p.offsetWidth; p.classList.add('show');
    setTimeout(()=>p.classList.remove('show'),1500);
}

// ===== INBOX =====
function addInbox(){
    const inp = el('inbox-input'); if(!inp.value.trim()) return;
    pushUndo('เพิ่ม Inbox', JSON.stringify(D));
    D.inbox.push({id:id(),text:inp.value.trim(),date:today()});
    inp.value=''; save(); renderInbox(); addXP(2); recordHeatmap();
}
function renderInbox(){
    const list = el('inbox-list'); if(!list) return;
    el('inbox-count').textContent = D.inbox.length;
    list.innerHTML = D.inbox.map(item=>`
        <div class="task-item"><div class="task-info"><div class="task-name">${esc(item.text)}</div><div class="task-meta">${item.date}</div></div>
        <div class="task-actions"><button class="task-action-btn" onclick="inboxToTask('${item.id}')" title="ย้ายไป Tasks"><i class="ri-arrow-right-line"></i></button><button class="task-action-btn del" onclick="delInbox('${item.id}')"><i class="ri-delete-bin-line"></i></button></div></div>
    `).join('');
    // Dashboard inbox
    const di = el('dash-inbox'); if(di) di.innerHTML = D.inbox.slice(0,5).map(i=>`<div style="font-size:13px;padding:4px 0;color:var(--text-secondary)">${esc(i.text)}</div>`).join('') || '<p class="text-muted">ว่าง</p>';
}
function delInbox(iid){ pushUndo('ลบ Inbox',JSON.stringify(D)); const item=D.inbox.find(i=>i.id===iid); if(item) moveToTrash('inbox',item); D.inbox=D.inbox.filter(i=>i.id!==iid); save(); renderInbox(); renderTrash(); }
function inboxToTask(iid){
    const item = D.inbox.find(i=>i.id===iid); if(!item) return;
    D.tasks.push({id:id(),name:item.text,priority:'medium',done:false,date:today(),status:'todo',eq:''});
    D.inbox = D.inbox.filter(i=>i.id!==iid);
    save(); renderInbox(); renderTasks(); renderKanban(); addXP(3);
}
function saveCapture(){
    const t = el('capture-text'); if(!t.value.trim()) return;
    D.inbox.push({id:id(),text:t.value.trim(),date:today()});
    t.value=''; save(); renderInbox(); closeModal('capture-modal'); addXP(2); recordHeatmap();
}

// ===== TASKS =====
function addTask(){
    const inp = el('task-input'); if(!inp.value.trim()) return;
    pushUndo('เพิ่มงาน',JSON.stringify(D));
    D.tasks.push({id:id(),name:inp.value.trim(),priority:el('task-priority').value,done:false,date:today(),status:'todo',eq:''});
    inp.value=''; save(); renderTasks(); renderKanban(); addXP(3); recordHeatmap();
}
function toggleTask(tid){
    const t = D.tasks.find(x=>x.id===tid); if(!t) return;
    t.done = !t.done; t.status = t.done?'done':'todo';
    if(t.done) addXP(10);
    save(); renderTasks(); renderKanban(); renderEisenhower(); updateDashboard();
}
function delTask(tid){ pushUndo('ลบงาน',JSON.stringify(D)); const item=D.tasks.find(t=>t.id===tid); if(item) moveToTrash('tasks',item); D.tasks=D.tasks.filter(t=>t.id!==tid); save(); renderTasks(); renderKanban(); renderEisenhower(); renderTrash(); }
function renderTasks(){
    const list = el('today-tasks'); if(!list) return;
    const todayTasks = D.tasks.filter(t=>t.date===today());
    list.innerHTML = todayTasks.map(t=>`
        <div class="task-item" draggable="true" ondragstart="dragTask(event,'${t.id}')">
            <div class="task-check ${t.done?'done':''}" onclick="toggleTask('${t.id}')"></div>
            <div class="task-info"><div class="task-name ${t.done?'done':''}">${esc(t.name)}</div>
            <div class="task-meta"><span class="priority-dot ${t.priority}"></span> ${t.priority==='high'?'สำคัญมาก':t.priority==='medium'?'สำคัญ':'ทั่วไป'}</div></div>
            <div class="task-actions"><button class="task-action-btn del" onclick="delTask('${t.id}')"><i class="ri-delete-bin-line"></i></button></div>
        </div>
    `).join('');
    // Dashboard timeline
    const dt = el('dash-timeline');
    if(dt) dt.innerHTML = todayTasks.slice(0,5).map(t=>`<div style="font-size:13px;padding:4px 0;display:flex;align-items:center;gap:6px"><span class="priority-dot ${t.priority}"></span><span class="${t.done?'done':''}" style="${t.done?'text-decoration:line-through;color:var(--text-secondary)':''}">${esc(t.name)}</span></div>`).join('') || '<p class="text-muted">ยังไม่มีงาน</p>';
}

// ===== KANBAN =====
let draggedTaskId = '';
function dragTask(e,tid){ draggedTaskId=tid; e.dataTransfer.effectAllowed='move'; }
function kanbanDrop(e,status){
    e.preventDefault();
    const t = D.tasks.find(x=>x.id===draggedTaskId); if(!t) return;
    t.status=status; t.done=(status==='done');
    if(t.done) addXP(10);
    save(); renderKanban(); renderTasks(); renderEisenhower();
}
function renderKanban(){
    ['todo','doing','done'].forEach(s=>{
        const col = el('kb-'+s); if(!col) return;
        const items = D.tasks.filter(t=>t.status===s);
        el('kb-'+s+'-count').textContent = items.length;
        col.innerHTML = items.map(t=>`
            <div class="kanban-card" draggable="true" ondragstart="dragTask(event,'${t.id}')">
                <div class="kanban-card-title">${esc(t.name)}</div>
                <div class="kanban-card-meta"><span class="priority-dot ${t.priority}"></span> ${t.priority}</div>
            </div>
        `).join('');
    });
}

// ===== EISENHOWER =====
function eqDrop(e,quad){
    e.preventDefault();
    const t = D.tasks.find(x=>x.id===draggedTaskId); if(!t) return;
    t.eq = quad; save(); renderEisenhower();
}
function renderEisenhower(){
    ['do','schedule','delegate','delete'].forEach(q=>{
        const col = el('eq-'+q); if(!col) return;
        col.innerHTML = D.tasks.filter(t=>t.eq===q).map(t=>`
            <div class="kanban-card" draggable="true" ondragstart="dragTask(event,'${t.id}')">
                <div class="kanban-card-title">${esc(t.name)}</div>
            </div>
        `).join('');
    });
}

// ===== PROJECTS =====
function addProject(){
    D.projects.push({id:id(),emoji:el('proj-emoji').value||'🚀',name:el('proj-name').value,desc:el('proj-desc').value,deadline:el('proj-deadline').value,progress:0,archived:false});
    save(); renderProjects(); closeModal('project-modal'); addXP(15); recordHeatmap();
    ['proj-emoji','proj-name','proj-desc','proj-deadline'].forEach(x=>el(x).value='');
}
function renderProjects(){
    const list = el('projects-list'); if(!list) return;
    list.innerHTML = D.projects.filter(p=>!p.archived).map(p=>`
        <div class="project-card"><div class="project-emoji">${p.emoji}</div><div class="project-title">${esc(p.name)}</div>
        <div class="project-desc">${esc(p.desc||'')}</div>
        <div class="project-progress"><div class="project-progress-fill" style="width:${p.progress}%;background:var(--accent-blue)"></div></div>
        <div class="project-meta"><span>${p.progress}%</span><span>${p.deadline||''}</span></div>
        <div style="margin-top:10px;display:flex;gap:6px"><input type="range" min="0" max="100" value="${p.progress}" style="flex:1;accent-color:var(--accent-blue)" onchange="updateProjProgress('${p.id}',this.value)"><button class="btn btn-sm btn-danger" onclick="archiveProject('${p.id}')">Archive</button></div></div>
    `).join('');
    el('s-proj').textContent = D.projects.filter(p=>!p.archived).length;
    // Dashboard
    const dp = el('dash-projects');
    if(dp) dp.innerHTML = D.projects.filter(p=>!p.archived).slice(0,3).map(p=>`<div style="font-size:13px;padding:4px 0">${p.emoji} ${esc(p.name)} <span style="color:var(--text-muted)">${p.progress}%</span></div>`).join('') || '<p class="text-muted">ยังไม่มีโปรเจกต์</p>';
}
function updateProjProgress(pid,val){ const p=D.projects.find(x=>x.id===pid); if(p){p.progress=parseInt(val);save();renderProjects();} }
function archiveProject(pid){ const p=D.projects.find(x=>x.id===pid); if(p){p.archived=true;save();renderProjects();renderArchive();addXP(20);} }

// ===== AREAS =====
function addArea(){
    D.areas.push({id:id(),emoji:el('area-emoji').value||'💼',name:el('area-name').value,desc:el('area-desc').value});
    save(); renderAreas(); closeModal('area-modal'); addXP(5);
    ['area-emoji','area-name','area-desc'].forEach(x=>el(x).value='');
}
function renderAreas(){
    const list = el('areas-list'); if(!list) return;
    list.innerHTML = D.areas.map(a=>`
        <div class="project-card"><div class="project-emoji">${a.emoji}</div><div class="project-title">${esc(a.name)}</div><div class="project-desc">${esc(a.desc||'')}</div>
        <button class="btn btn-sm btn-danger" onclick="delArea('${a.id}')">ลบ</button></div>
    `).join('');
}
function delArea(aid){ D.areas=D.areas.filter(a=>a.id!==aid); save(); renderAreas(); }

// ===== RESOURCES & ARCHIVE =====
function renderResources(){
    const list = el('resources-list'); if(!list) return;
    list.innerHTML = D.notes.filter(n=>n.type==='resource').map(n=>noteCardHTML(n)).join('');
}
function renderArchive(){
    const list = el('archive-list'); if(!list) return;
    list.innerHTML = D.projects.filter(p=>p.archived).map(p=>`<div class="task-item"><div class="task-info"><div class="task-name">${p.emoji} ${esc(p.name)}</div></div></div>`).join('') || '<p class="text-muted">ว่าง</p>';
}

// ===== KNOWLEDGE BASE (Markdown) =====
function openNoteModal(type){
    el('note-type').value = type;
    el('note-modal-title').textContent = type==='resource'?'เพิ่ม Resource':'โน้ตใหม่';
    // Populate links
    const sel = el('note-links'); sel.innerHTML = D.notes.map(n=>`<option value="${n.id}">${esc(n.title)}</option>`).join('');
    openModal('note-modal');
}
function saveNote(){
    const tags = el('note-tags').value.split(',').map(t=>t.trim()).filter(Boolean);
    const links = Array.from(el('note-links').selectedOptions).map(o=>o.value);
    D.notes.push({id:id(),title:el('note-title').value,content:el('note-content').value,tags,links,type:el('note-type').value,date:today()});
    save(); renderNotes(); renderResources(); closeModal('note-modal'); addXP(8); recordHeatmap();
    ['note-title','note-content','note-tags'].forEach(x=>el(x).value='');
}
function renderNotes(){
    const list = el('notes-list'); if(!list) return;
    list.innerHTML = D.notes.filter(n=>n.type==='note').map(n=>noteCardHTML(n)).join('');
}
function noteCardHTML(n){
    return `<div class="note-card" onclick="viewNote('${n.id}')"><div class="note-card-title">${esc(n.title)}</div><div class="note-card-preview">${renderMD(n.content||'')}</div><div class="note-tags">${(n.tags||[]).map(t=>`<span class="note-tag">${esc(t)}</span>`).join('')}</div></div>`;
}
function viewNote(nid){
    const n = D.notes.find(x=>x.id===nid); if(!n) return;
    const content = `<h3>${esc(n.title)}</h3><div style="margin-top:12px;line-height:1.8;font-size:14px">${renderMD(n.content||'')}</div><div style="margin-top:12px">${(n.tags||[]).map(t=>`<span class="note-tag">${esc(t)}</span>`).join(' ')}</div><div style="margin-top:16px"><button class="btn btn-sm btn-danger" onclick="delNote('${n.id}')">ลบโน้ต</button></div>`;
    showInfoModal(content);
}
function delNote(nid){ D.notes=D.notes.filter(n=>n.id!==nid); save(); renderNotes(); renderResources(); closeAllModals(); }
// Simple Markdown renderer
function renderMD(text){
    return esc(text)
        .replace(/^### (.+)$/gm,'<strong style="font-size:15px">$1</strong>')
        .replace(/^## (.+)$/gm,'<strong style="font-size:16px">$1</strong>')
        .replace(/^# (.+)$/gm,'<strong style="font-size:18px">$1</strong>')
        .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
        .replace(/\*(.+?)\*/g,'<em>$1</em>')
        .replace(/`(.+?)`/g,'<code style="background:var(--bg-input);padding:1px 5px;border-radius:4px;font-size:12px">$1</code>')
        .replace(/^- (.+)$/gm,'• $1')
        .replace(/\n/g,'<br>');
}

// ===== KNOWLEDGE GRAPH =====
function renderGraph(){
    const canvas = el('knowledge-graph'); if(!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(D.notes.length===0){ ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--text-muted');ctx.font='14px Inter';ctx.textAlign='center';ctx.fillText('เพิ่มโน้ตเพื่อดู Knowledge Graph',canvas.width/2,canvas.height/2);return; }
    // Position nodes
    const nodes = D.notes.map((n,i)=>{
        const angle = (i/D.notes.length)*Math.PI*2;
        const r = Math.min(canvas.width,canvas.height)*0.35;
        return {id:n.id,x:canvas.width/2+Math.cos(angle)*r,y:canvas.height/2+Math.sin(angle)*r,title:n.title,links:n.links||[]};
    });
    // Draw links
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border-light');
    ctx.lineWidth = 1;
    nodes.forEach(n=>{ n.links.forEach(lid=>{ const target=nodes.find(x=>x.id===lid); if(target){ctx.beginPath();ctx.moveTo(n.x,n.y);ctx.lineTo(target.x,target.y);ctx.stroke();} }); });
    // Draw nodes
    const blue = getComputedStyle(document.documentElement).getPropertyValue('--accent-blue');
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary');
    nodes.forEach(n=>{
        ctx.beginPath(); ctx.arc(n.x,n.y,8,0,Math.PI*2); ctx.fillStyle=blue; ctx.fill();
        ctx.fillStyle=textColor; ctx.font='12px Inter, Noto Sans Thai'; ctx.textAlign='center'; ctx.fillText(n.title,n.x,n.y-14);
    });
}

// ===== SPACED REPETITION =====
function addSRCard(){
    D.srCards.push({id:id(),front:el('sr-front').value,back:el('sr-back').value,interval:1,nextReview:today(),ease:2.5});
    save(); renderSRCards(); closeModal('sr-modal'); addXP(5);
    ['sr-front','sr-back'].forEach(x=>el(x).value='');
}
function renderSRCards(){
    const cont = el('sr-container'); if(!cont) return;
    const due = D.srCards.filter(c=>c.nextReview<=today());
    if(due.length===0){ cont.innerHTML='<div class="card"><div class="card-body" style="text-align:center;padding:40px"><i class="ri-check-double-line" style="font-size:48px;color:var(--accent-green)"></i><p style="margin-top:12px;color:var(--text-secondary)">ไม่มีการ์ดที่ต้องทบทวนวันนี้!</p></div></div>'; return; }
    cont.innerHTML = due.map(c=>`
        <div class="sr-card" id="sr-${c.id}"><div class="sr-card-front">${esc(c.front)}</div>
        <div class="sr-card-back" id="srb-${c.id}">${esc(c.back)}</div>
        <button class="btn btn-secondary" onclick="document.getElementById('srb-${c.id}').classList.toggle('show')" style="margin-bottom:12px">แสดงคำตอบ</button>
        <div class="sr-buttons"><button class="btn btn-danger btn-sm" onclick="reviewSR('${c.id}',1)">ยาก</button><button class="btn btn-secondary btn-sm" onclick="reviewSR('${c.id}',3)">ปกติ</button><button class="btn btn-success btn-sm" onclick="reviewSR('${c.id}',5)">ง่าย</button></div></div>
    `).join('');
}
function reviewSR(cid,quality){
    const c = D.srCards.find(x=>x.id===cid); if(!c) return;
    c.ease = Math.max(1.3, c.ease + 0.1 - (5-quality)*(0.08+(5-quality)*0.02));
    c.interval = quality<3 ? 1 : Math.ceil(c.interval * c.ease);
    const next = new Date(); next.setDate(next.getDate()+c.interval);
    c.nextReview = next.toISOString().slice(0,10);
    save(); renderSRCards(); addXP(5); recordHeatmap();
}

// ===== READING LIST =====
function addBook(){
    D.books.push({id:id(),title:el('read-title').value,author:el('read-author').value,status:el('read-status').value,notes:el('read-notes').value,date:today()});
    save(); renderBooks(); closeModal('reading-modal'); addXP(5);
    ['read-title','read-author','read-notes'].forEach(x=>el(x).value='');
}
let readingFilter = 'all';
function filterReading(f,btn){
    readingFilter = f;
    document.querySelectorAll('.reading-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    renderBooks();
}
function renderBooks(){
    const list = el('reading-list'); if(!list) return;
    const filtered = readingFilter==='all' ? D.books : D.books.filter(b=>b.status===readingFilter);
    list.innerHTML = filtered.map(b=>`
        <div class="book-card"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><span class="book-status ${b.status}">${b.status==='want'?'อยากอ่าน':b.status==='reading'?'กำลังอ่าน':'อ่านจบ'}</span><button class="task-action-btn del" onclick="delBook('${b.id}')"><i class="ri-delete-bin-line"></i></button></div>
        <div style="font-size:15px;font-weight:600;margin-bottom:4px">${esc(b.title)}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">${esc(b.author||'')}</div>
        ${b.notes?`<div style="font-size:12px;color:var(--text-muted);line-height:1.5">${esc(b.notes)}</div>`:''}
        <select class="form-select" style="margin-top:8px;font-size:11px" onchange="updateBookStatus('${b.id}',this.value)"><option value="want" ${b.status==='want'?'selected':''}>อยากอ่าน</option><option value="reading" ${b.status==='reading'?'selected':''}>กำลังอ่าน</option><option value="done" ${b.status==='done'?'selected':''}>อ่านจบ</option></select></div>
    `).join('');
}
function updateBookStatus(bid,s){ const b=D.books.find(x=>x.id===bid);if(b){b.status=s;if(s==='done')addXP(15);save();renderBooks();} }
function delBook(bid){ D.books=D.books.filter(b=>b.id!==bid); save(); renderBooks(); }

// ===== JOURNAL =====
let selectedMood = '';
function selectMood(mood){
    selectedMood = mood;
    document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('selected'));
    event.target.classList.add('selected');
}
function saveJournal(){
    if(!el('journal-text').value.trim() && !selectedMood) return;
    D.journals.push({id:id(),mood:selectedMood,text:el('journal-text').value,date:today()});
    el('journal-text').value=''; selectedMood='';
    document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('selected'));
    save(); renderJournals(); addXP(10); recordHeatmap();
}
function renderJournals(){
    const list = el('journal-list'); if(!list) return;
    const moodEmoji = {amazing:'🤩',happy:'😊',okay:'😐',sad:'😔',stressed:'😩'};
    list.innerHTML = D.journals.slice().reverse().slice(0,20).map(j=>`
        <div class="journal-entry"><div class="journal-date">${moodEmoji[j.mood]||''} ${j.date}</div><div class="journal-text">${renderMD(j.text||'')}</div></div>
    `).join('');
}

// ===== HABITS =====
function addHabit(){
    D.habits.push({id:id(),emoji:el('habit-emoji').value||'💪',name:el('habit-name').value,days:{}});
    save(); renderHabits(); closeModal('habit-modal'); addXP(5);
    ['habit-emoji','habit-name'].forEach(x=>el(x).value='');
}
function toggleHabitDay(hid,date){
    const h = D.habits.find(x=>x.id===hid); if(!h) return;
    h.days[date] = !h.days[date];
    if(h.days[date]) addXP(5);
    save(); renderHabits(); recordHeatmap();
}
function renderHabits(){
    const list = el('habits-list'); if(!list) return;
    const days = [];
    for(let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); days.push(d.toISOString().slice(0,10)); }
    const dayLabels = ['อา','จ','อ','พ','พฤ','ศ','ส'];
    list.innerHTML = D.habits.map(h=>{
        const streak = getHabitStreak(h);
        return `<div class="habit-item"><div class="habit-icon">${h.emoji}</div><div class="habit-info"><div class="habit-name">${esc(h.name)}</div><div class="habit-streak">🔥 ${streak} วัน streak</div></div>
        <div class="habit-days">${days.map(d=>`<div class="habit-day ${h.days[d]?'done':''}" onclick="toggleHabitDay('${h.id}','${d}')">${dayLabels[new Date(d).getDay()]}</div>`).join('')}</div>
        <button class="task-action-btn del" onclick="delHabit('${h.id}')"><i class="ri-delete-bin-line"></i></button></div>`;
    }).join('');
    // Dashboard habits
    const dh = el('dash-habits');
    if(dh) dh.innerHTML = D.habits.slice(0,5).map(h=>`<div style="font-size:13px;padding:4px 0;display:flex;align-items:center;gap:6px">${h.emoji} ${esc(h.name)} ${h.days[today()]?'✅':''}</div>`).join('') || '<p class="text-muted">ยังไม่มี</p>';
}
function getHabitStreak(h){
    let streak=0; const d=new Date();
    while(true){ const ds=d.toISOString().slice(0,10); if(h.days[ds])streak++; else break; d.setDate(d.getDate()-1); if(streak>365)break; }
    return streak;
}
function delHabit(hid){ D.habits=D.habits.filter(h=>h.id!==hid); save(); renderHabits(); }

// ===== RITUALS =====
const RITUALS = {
    morning:[{icon:'🌅',name:'ตื่นนอน',desc:'ลุกจากเตียงทันที'},{icon:'💧',name:'ดื่มน้ำ',desc:'1 แก้วใหญ่'},{icon:'🧘',name:'สมาธิ/หายใจ',desc:'5 นาที'},{icon:'📝',name:'เขียน Gratitude',desc:'3 สิ่งที่ขอบคุณ'},{icon:'📋',name:'วางแผนวันนี้',desc:'เลือก 3 งานหลัก'}],
    evening:[{icon:'📖',name:'ทบทวนวัน',desc:'สิ่งที่ทำได้ดี/ปรับปรุง'},{icon:'📕',name:'อ่านหนังสือ',desc:'15-30 นาที'},{icon:'📅',name:'วางแผนพรุ่งนี้',desc:'เตรียม 3 งาน'},{icon:'🧹',name:'จัด Inbox',desc:'เคลียร์ทุกอย่าง'},{icon:'😴',name:'เข้านอน',desc:'ปิดจอก่อน 30 นาที'}]
};
function renderRituals(){
    ['morning','evening'].forEach(type=>{
        const cont = el(type+'-ritual'); if(!cont) return;
        const key = today()+'_'+type;
        if(!D.rituals[type]) D.rituals[type] = {};
        const status = D.rituals[type][key] || {};
        cont.innerHTML = RITUALS[type].map((r,i)=>`
            <div class="ritual-step ${status[i]?'completed':''}" onclick="toggleRitual('${type}',${i})">
                <div class="ritual-check"></div><div class="ritual-icon">${r.icon}</div>
                <div class="ritual-info"><h4>${r.name}</h4><p>${r.desc}</p></div>
            </div>
        `).join('');
    });
}
function toggleRitual(type,idx){
    const key = today()+'_'+type;
    if(!D.rituals[type]) D.rituals[type] = {};
    if(!D.rituals[type][key]) D.rituals[type][key] = {};
    D.rituals[type][key][idx] = !D.rituals[type][key][idx];
    if(D.rituals[type][key][idx]) addXP(3);
    save(); renderRituals(); recordHeatmap();
}
function resetRitual(type){
    const key = today()+'_'+type;
    if(D.rituals[type]) D.rituals[type][key] = {};
    save(); renderRituals();
}

// ===== HEALTH DASHBOARD =====
function logHealth(type){
    const val = parseFloat(el('health-'+type).value); if(isNaN(val)) return;
    if(!D.health[type]) D.health[type] = [];
    D.health[type].push({date:today(),value:val});
    el('health-'+type).value = '';
    save(); renderHealth(); addXP(3); recordHeatmap();
}
function renderWaterCups(){
    const cont = el('water-cups'); if(!cont) return;
    const todayWater = D.health.water[today()] || 0;
    cont.innerHTML = Array(8).fill(0).map((_,i)=>`<div class="water-cup ${i<todayWater?'filled':''}" onclick="setWater(${i+1})">💧</div>`).join('');
}
function setWater(n){
    D.health.water[today()] = n;
    save(); renderWaterCups(); addXP(1);
}
function renderHealth(){
    renderWaterCups();
    drawMiniChart('weight-chart', D.health.weight||[], 'var(--accent-blue)');
    drawMiniChart('sleep-chart', D.health.sleep||[], 'var(--accent-purple)');
}
function drawMiniChart(canvasId, data, color){
    const canvas = el(canvasId); if(!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth; canvas.height = 200;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const last7 = data.slice(-7);
    if(last7.length<2) { ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--text-muted');ctx.font='13px Inter';ctx.textAlign='center';ctx.fillText('ต้องการข้อมูลอย่างน้อย 2 วัน',canvas.width/2,100);return; }
    const vals = last7.map(d=>d.value);
    const min = Math.min(...vals)*0.95; const max = Math.max(...vals)*1.05;
    const range = max-min||1;
    const stepX = canvas.width/(last7.length-1);
    const cs = getComputedStyle(document.documentElement);
    ctx.strokeStyle = cs.getPropertyValue(color.replace('var(','').replace(')','')) || color;
    ctx.lineWidth = 2; ctx.beginPath();
    last7.forEach((d,i)=>{
        const x = i*stepX; const y = canvas.height-20-((d.value-min)/range)*(canvas.height-40);
        i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    });
    ctx.stroke();
    // Dots
    ctx.fillStyle = ctx.strokeStyle;
    last7.forEach((d,i)=>{
        const x = i*stepX; const y = canvas.height-20-((d.value-min)/range)*(canvas.height-40);
        ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
        ctx.fillStyle=cs.getPropertyValue('--text-secondary');ctx.font='11px Inter';ctx.textAlign='center';
        ctx.fillText(d.value.toString(),x,y-10);
        ctx.fillStyle = ctx.strokeStyle;
    });
}

// ===== FINANCE =====
function addFinance(){
    D.finances.push({id:id(),type:el('fin-type').value,desc:el('fin-desc').value,amount:parseFloat(el('fin-amount').value)||0,cat:el('fin-cat').value,date:today()});
    save(); renderFinance(); closeModal('finance-modal'); addXP(3); recordHeatmap();
    ['fin-desc','fin-amount'].forEach(x=>el(x).value='');
}
function renderFinance(){
    const month = today().slice(0,7);
    const monthItems = D.finances.filter(f=>f.date.startsWith(month));
    const income = monthItems.filter(f=>f.type==='income').reduce((s,f)=>s+f.amount,0);
    const expense = monthItems.filter(f=>f.type==='expense').reduce((s,f)=>s+f.amount,0);
    el('fin-income').textContent = fmt(income);
    el('fin-expense').textContent = fmt(expense);
    el('fin-balance').textContent = fmt(income-expense);
    el('fin-balance').style.color = income-expense>=0?'var(--accent-green)':'var(--accent-red)';
    // List
    const list = el('finance-list'); if(!list) return;
    const catIcons = {food:'🍔',transport:'🚗',shopping:'🛍️',bills:'📄',salary:'💰',freelance:'💻',other:'📦'};
    list.innerHTML = D.finances.slice().reverse().slice(0,20).map(f=>`
        <div class="fin-item"><div class="fin-icon ${f.type}">${catIcons[f.cat]||'📦'}</div><div class="task-info"><div class="task-name">${esc(f.desc)}</div><div class="task-meta">${f.date} · ${f.cat}</div></div>
        <div class="fin-amount ${f.type}">${f.type==='income'?'+':'-'}${fmt(f.amount)}฿</div></div>
    `).join('');
    // Chart
    drawFinanceChart();
}
function drawFinanceChart(){
    const canvas = el('finance-chart'); if(!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth; canvas.height = 220;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // Last 6 months
    const months = [];
    for(let i=5;i>=0;i--){ const d=new Date(); d.setMonth(d.getMonth()-i); months.push(d.toISOString().slice(0,7)); }
    const barW = canvas.width/months.length*0.3;
    const gap = canvas.width/months.length;
    let maxVal = 1;
    const mData = months.map(m=>{
        const items = D.finances.filter(f=>f.date.startsWith(m));
        const inc = items.filter(f=>f.type==='income').reduce((s,f)=>s+f.amount,0);
        const exp = items.filter(f=>f.type==='expense').reduce((s,f)=>s+f.amount,0);
        maxVal = Math.max(maxVal,inc,exp);
        return {month:m.slice(5),inc,exp};
    });
    const cs = getComputedStyle(document.documentElement);
    mData.forEach((d,i)=>{
        const x = i*gap+gap/2;
        const hInc = (d.inc/maxVal)*170;
        const hExp = (d.exp/maxVal)*170;
        ctx.fillStyle = cs.getPropertyValue('--accent-green');
        ctx.fillRect(x-barW,200-hInc,barW,hInc);
        ctx.fillStyle = cs.getPropertyValue('--accent-orange');
        ctx.fillRect(x,200-hExp,barW,hExp);
        ctx.fillStyle = cs.getPropertyValue('--text-secondary');
        ctx.font='11px Inter';ctx.textAlign='center';
        ctx.fillText(d.month,x,215);
    });
}

// ===== TIME TRACKER =====
let ttInterval = null, ttStart = null, ttRunning = false;
function toggleTimeTracker(){
    if(ttRunning){ stopTimeTracker(); } else { startTimeTracker(); }
}
function startTimeTracker(){
    ttStart = Date.now(); ttRunning = true;
    el('tt-btn').innerHTML = '<i class="ri-stop-line"></i> หยุด';
    el('tt-btn').classList.remove('btn-primary'); el('tt-btn').classList.add('btn-danger');
    ttInterval = setInterval(updateTTDisplay, 1000);
}
function stopTimeTracker(){
    clearInterval(ttInterval); ttRunning = false;
    const elapsed = Date.now()-ttStart;
    const name = el('tt-task-name').value || 'ไม่ระบุ';
    D.timeEntries.push({id:id(),name,duration:elapsed,date:today()});
    el('tt-btn').innerHTML = '<i class="ri-play-line"></i> เริ่มจับเวลา';
    el('tt-btn').classList.add('btn-primary'); el('tt-btn').classList.remove('btn-danger');
    el('tt-timer').textContent = '00:00:00';
    el('tt-task-name').value = '';
    save(); renderTimeHistory(); addXP(5); recordHeatmap();
}
function updateTTDisplay(){
    const elapsed = Date.now()-ttStart;
    el('tt-timer').textContent = formatDuration(elapsed);
}
function formatDuration(ms){
    const s = Math.floor(ms/1000); const m = Math.floor(s/60); const h = Math.floor(m/60);
    return `${String(h).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
function renderTimeHistory(){
    const list = el('tt-history'); if(!list) return;
    const todayEntries = D.timeEntries.filter(e=>e.date===today());
    list.innerHTML = todayEntries.map(e=>`<div class="tt-entry"><span>${esc(e.name)}</span><span class="tt-duration">${formatDuration(e.duration)}</span></div>`).join('') || '<p class="text-muted">ยังไม่มีประวัติ</p>';
}

// ===== OKR =====
function addOKR(){
    const krs = el('okr-krs').value.split('\n').filter(Boolean).map(k=>({text:k.trim(),progress:0}));
    D.okrs.push({id:id(),obj:el('okr-obj').value,krs,quarter:el('okr-quarter').value});
    save(); renderOKRs(); closeModal('okr-modal'); addXP(10);
    ['okr-obj','okr-krs'].forEach(x=>el(x).value='');
}
function renderOKRs(){
    const list = el('okr-list'); if(!list) return;
    list.innerHTML = D.okrs.map(o=>{
        const avg = o.krs.length?Math.round(o.krs.reduce((s,k)=>s+k.progress,0)/o.krs.length):0;
        return `<div class="okr-card"><div class="okr-obj"><span class="okr-quarter">${o.quarter}</span> ${esc(o.obj)} <span style="margin-left:auto;font-size:14px;color:var(--accent-blue)">${avg}%</span></div>
        ${o.krs.map((k,i)=>`<div class="kr-item"><span style="flex:1">${esc(k.text)}</span><div class="kr-progress"><div class="kr-progress-fill" style="width:${k.progress}%"></div></div><span class="kr-value">${k.progress}%</span><input type="range" min="0" max="100" value="${k.progress}" style="width:80px;accent-color:var(--accent-blue)" onchange="updateKR('${o.id}',${i},this.value)"></div>`).join('')}
        <button class="btn btn-sm btn-danger" style="margin-top:8px" onclick="delOKR('${o.id}')">ลบ</button></div>`;
    }).join('');
}
function updateKR(oid,ki,val){ const o=D.okrs.find(x=>x.id===oid); if(o&&o.krs[ki]){o.krs[ki].progress=parseInt(val);save();renderOKRs();} }
function delOKR(oid){ D.okrs=D.okrs.filter(o=>o.id!==oid); save(); renderOKRs(); }

// ===== LIFE WHEEL =====
const LW_AREAS = [
    {key:'career',label:'อาชีพ',emoji:'💼'},{key:'finance',label:'การเงิน',emoji:'💰'},
    {key:'health',label:'สุขภาพ',emoji:'❤️'},{key:'relationships',label:'ความสัมพันธ์',emoji:'👥'},
    {key:'fun',label:'ความสนุก',emoji:'🎉'},{key:'environment',label:'สภาพแวดล้อม',emoji:'🏠'},
    {key:'growth',label:'การเติบโต',emoji:'📚'},{key:'contribution',label:'การให้คืน',emoji:'🤝'}
];
function renderLifeWheelInputs(){
    const cont = el('lifewheel-inputs'); if(!cont) return;
    cont.innerHTML = LW_AREAS.map(a=>`
        <div class="lw-input"><span class="lw-label">${a.emoji} ${a.label}</span>
        <input type="range" min="1" max="10" value="${D.lifewheel[a.key]||5}" oninput="updateLW('${a.key}',this.value)">
        <span class="lw-val" id="lw-${a.key}">${D.lifewheel[a.key]||5}</span></div>
    `).join('');
}
function updateLW(key,val){ D.lifewheel[key]=parseInt(val); el('lw-'+key).textContent=val; save(); renderLifeWheel(); }
function renderLifeWheel(){
    const canvas = el('lifewheel-canvas'); if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const w=400,h=400,cx=w/2,cy=h/2,r=150;
    canvas.width=w; canvas.height=h;
    ctx.clearRect(0,0,w,h);
    const cs = getComputedStyle(document.documentElement);
    // Grid circles
    for(let i=2;i<=10;i+=2){
        ctx.beginPath();
        ctx.arc(cx,cy,r*i/10,0,Math.PI*2);
        ctx.strokeStyle=cs.getPropertyValue('--border');
        ctx.lineWidth=1; ctx.stroke();
    }
    // Data
    const areas = LW_AREAS;
    const pts = areas.map((a,i)=>{
        const angle = (i/areas.length)*Math.PI*2 - Math.PI/2;
        const val = D.lifewheel[a.key]||5;
        return {x:cx+Math.cos(angle)*r*val/10, y:cy+Math.sin(angle)*r*val/10, label:a.emoji+' '+a.label, angle};
    });
    // Lines
    areas.forEach((_,i)=>{
        const angle = (i/areas.length)*Math.PI*2 - Math.PI/2;
        ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(angle)*r,cy+Math.sin(angle)*r);
        ctx.strokeStyle=cs.getPropertyValue('--border');ctx.lineWidth=1;ctx.stroke();
    });
    // Fill
    ctx.beginPath();
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.fillStyle = cs.getPropertyValue('--accent-blue').trim()+'33';
    ctx.fill();
    ctx.strokeStyle = cs.getPropertyValue('--accent-blue');
    ctx.lineWidth = 2; ctx.stroke();
    // Dots & Labels
    pts.forEach(p=>{
        ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fillStyle=cs.getPropertyValue('--accent-blue');ctx.fill();
        ctx.fillStyle=cs.getPropertyValue('--text-primary');ctx.font='12px Inter, Noto Sans Thai';ctx.textAlign='center';
        const lx = cx+Math.cos(p.angle)*(r+20); const ly = cy+Math.sin(p.angle)*(r+20);
        ctx.fillText(p.label,lx,ly);
    });
}

// ===== WEEKLY REVIEW =====
function saveReview(){
    D.reviews.push({id:id(),good:el('review-good').value,improve:el('review-improve').value,next:el('review-next').value,date:today()});
    save(); renderReviewHistory(); addXP(15); recordHeatmap();
    ['review-good','review-improve','review-next'].forEach(x=>el(x).value='');
}
function renderReviewHistory(){
    const list = el('review-history'); if(!list) return;
    list.innerHTML = D.reviews.slice().reverse().slice(0,5).map(r=>`
        <div class="card" style="margin-bottom:12px"><div class="card-header"><span class="card-title">${r.date}</span></div><div class="card-body">
        <div style="margin-bottom:8px"><strong style="color:var(--accent-green)">✅ ทำได้ดี:</strong><p style="font-size:13px;margin-top:4px">${renderMD(r.good||'')}</p></div>
        <div style="margin-bottom:8px"><strong style="color:var(--accent-orange)">🔧 ปรับปรุง:</strong><p style="font-size:13px;margin-top:4px">${renderMD(r.improve||'')}</p></div>
        <div><strong style="color:var(--accent-blue)">🎯 สัปดาห์หน้า:</strong><p style="font-size:13px;margin-top:4px">${renderMD(r.next||'')}</p></div></div></div>
    `).join('');
}

// ===== VISION BOARD =====
function addVision(){
    D.visions.push({id:id(),emoji:el('vis-emoji').value||'🎯',title:el('vis-title').value,desc:el('vis-desc').value,color:el('vis-color').value});
    save(); renderVisions(); closeModal('vision-modal'); addXP(5);
    ['vis-emoji','vis-title','vis-desc'].forEach(x=>el(x).value='');
}
function renderVisions(){
    const list = el('vision-board'); if(!list) return;
    list.innerHTML = D.visions.map(v=>`
        <div class="vision-card vc-${v.color}"><div class="vision-emoji">${v.emoji}</div><div class="vision-title">${esc(v.title)}</div><div class="vision-desc">${esc(v.desc)}</div>
        <button class="task-action-btn del" style="position:absolute;top:8px;right:8px" onclick="delVision('${v.id}')"><i class="ri-close-line"></i></button></div>
    `).join('');
}
function delVision(vid){ D.visions=D.visions.filter(v=>v.id!==vid); save(); renderVisions(); }

// ===== TEMPLATES =====
const TEMPLATES = [
    {icon:'📋',name:'Meeting Notes',desc:'บันทึกการประชุม',content:'# Meeting Notes\n\n**วันที่:** \n**ผู้เข้าร่วม:** \n\n## Agenda\n- \n\n## Discussion\n\n\n## Action Items\n- [ ] \n- [ ] '},
    {icon:'💡',name:'Decision Log',desc:'บันทึกการตัดสินใจ',content:'# Decision Log\n\n**สถานการณ์:** \n**ตัวเลือก:**\n1. \n2. \n3. \n\n**เลือก:** \n**เหตุผล:** '},
    {icon:'📅',name:'Weekly Plan',desc:'แผนประจำสัปดาห์',content:'# Weekly Plan\n\n## เป้าหมายสัปดาห์นี้\n1. \n2. \n3. \n\n## จันทร์\n- \n\n## อังคาร\n- \n\n## พุธ\n- \n\n## พฤหัสบดี\n- \n\n## ศุกร์\n- '},
    {icon:'🚀',name:'Project Brief',desc:'สรุปโปรเจกต์',content:'# Project Brief\n\n**ชื่อโปรเจกต์:** \n**เป้าหมาย:** \n**Stakeholders:** \n\n## Scope\n\n\n## Timeline\n\n\n## Success Metrics\n- '},
    {icon:'🐛',name:'Bug Report',desc:'รายงานบัค',content:'# Bug Report\n\n**สรุป:** \n**ขั้นตอนที่ทำให้เกิด:**\n1. \n2. \n\n**ผลที่คาดหวัง:** \n**ผลที่เกิดขึ้นจริง:** \n\n**สภาพแวดล้อม:** '},
    {icon:'💭',name:'Brainstorm',desc:'ระดมความคิด',content:'# Brainstorm: \n\n## ไอเดีย\n- \n- \n- \n\n## จัดกลุ่ม\n\n\n## สรุป\n'}
];
function renderTemplates(){
    const list = el('templates-list'); if(!list) return;
    list.innerHTML = TEMPLATES.map((t,i)=>`
        <div class="template-card" onclick="useTemplate(${i})"><div class="template-icon">${t.icon}</div><div class="template-name">${t.name}</div><div class="template-desc">${t.desc}</div></div>
    `).join('');
}
function useTemplate(idx){
    const t = TEMPLATES[idx];
    el('note-type').value = 'note';
    el('note-title').value = t.name;
    el('note-content').value = t.content;
    el('note-tags').value = '';
    el('note-modal-title').textContent = t.name;
    openModal('note-modal');
}

// ===== ACHIEVEMENTS =====
const ACHIEVES = [
    {id:'first_task',icon:'🎯',name:'First Step',desc:'สร้างงานแรก',check:()=>D.tasks.length>=1},
    {id:'task_10',icon:'⚡',name:'Productive',desc:'ทำงานสำเร็จ 10 งาน',check:()=>D.tasks.filter(t=>t.done).length>=10},
    {id:'task_50',icon:'🔥',name:'On Fire',desc:'ทำงานสำเร็จ 50 งาน',check:()=>D.tasks.filter(t=>t.done).length>=50},
    {id:'streak_7',icon:'📅',name:'Weekly Warrior',desc:'Streak 7 วัน',check:()=>D.streak>=7},
    {id:'streak_30',icon:'🏆',name:'Monthly Master',desc:'Streak 30 วัน',check:()=>D.streak>=30},
    {id:'notes_10',icon:'📝',name:'Knowledge Seeker',desc:'สร้าง 10 โน้ต',check:()=>D.notes.length>=10},
    {id:'journal_7',icon:'📖',name:'Reflector',desc:'เขียน Journal 7 วัน',check:()=>D.journals.length>=7},
    {id:'habit_hero',icon:'💪',name:'Habit Hero',desc:'สร้าง 5 นิสัย',check:()=>D.habits.length>=5},
    {id:'level_5',icon:'⭐',name:'Rising Star',desc:'ถึง Level 5',check:()=>D.level>=5},
    {id:'level_10',icon:'🌟',name:'Legendary',desc:'ถึง Level 10',check:()=>D.level>=10},
    {id:'project_5',icon:'🚀',name:'Builder',desc:'สร้าง 5 โปรเจกต์',check:()=>D.projects.length>=5},
    {id:'reader',icon:'📚',name:'Bookworm',desc:'อ่านจบ 5 เล่ม',check:()=>D.books.filter(b=>b.status==='done').length>=5},
];
function checkAchievements(){
    let newUnlock = false;
    ACHIEVES.forEach(a=>{
        if(!D.achievements[a.id] && a.check()){ D.achievements[a.id]=true; newUnlock=true; }
    });
    if(newUnlock) save();
}
function renderAchievements(){
    const list = el('achievements-list'); if(!list) return;
    checkAchievements();
    list.innerHTML = ACHIEVES.map(a=>`
        <div class="achievement ${D.achievements[a.id]?'unlocked':'locked'}"><div class="achievement-icon">${a.icon}</div><div class="achievement-name">${a.name}</div><div class="achievement-desc">${a.desc}</div></div>
    `).join('');
}

// ===== ANALYTICS =====
function renderAnalytics(){
    // Productivity Score
    const todayTasks = D.tasks.filter(t=>t.date===today());
    const doneToday = todayTasks.filter(t=>t.done).length;
    const totalToday = todayTasks.length || 1;
    const prodScore = Math.round((doneToday/totalToday)*100);
    el('prod-score').textContent = prodScore;
    el('prod-ring').style.strokeDashoffset = 326.73 - (prodScore/100)*326.73;
    // Habit Score
    const todayHabits = D.habits.length||1;
    const doneHabits = D.habits.filter(h=>h.days[today()]).length;
    const habitPct = Math.round((doneHabits/todayHabits)*100);
    el('habit-score').textContent = habitPct+'%';
    el('habit-ring').style.strokeDashoffset = 326.73 - (habitPct/100)*326.73;
    // Mood chart
    drawMoodChart();
    // Tasks chart
    drawTasksChart();
}
function drawMoodChart(){
    const canvas = el('mood-chart'); if(!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth; canvas.height = 140;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const moodMap = {amazing:5,happy:4,okay:3,sad:2,stressed:1};
    const last7 = D.journals.slice(-7);
    if(last7.length<2) return;
    const vals = last7.map(j=>moodMap[j.mood]||3);
    const stepX = canvas.width/(vals.length-1);
    const cs = getComputedStyle(document.documentElement);
    ctx.strokeStyle = cs.getPropertyValue('--accent-pink');
    ctx.lineWidth = 2; ctx.beginPath();
    vals.forEach((v,i)=>{
        const x = i*stepX; const y = canvas.height-20-((v-1)/4)*(canvas.height-40);
        i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    });
    ctx.stroke();
}
function drawTasksChart(){
    const canvas = el('tasks-chart'); if(!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth; canvas.height = 200;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const days = []; for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(d.toISOString().slice(0,10));}
    const vals = days.map(d=>D.tasks.filter(t=>t.date===d&&t.done).length);
    const max = Math.max(...vals,1);
    const barW = canvas.width/7*0.6;
    const cs = getComputedStyle(document.documentElement);
    vals.forEach((v,i)=>{
        const x = i*(canvas.width/7)+canvas.width/14-barW/2;
        const h = (v/max)*160;
        ctx.fillStyle = cs.getPropertyValue('--accent-blue');
        ctx.fillRect(x,180-h,barW,h);
        ctx.fillStyle = cs.getPropertyValue('--text-secondary');
        ctx.font='10px Inter';ctx.textAlign='center';
        ctx.fillText(days[i].slice(8),x+barW/2,195);
        if(v>0){ctx.fillText(v.toString(),x+barW/2,175-h);}
    });
}

// ===== HEATMAP =====
function recordHeatmap(){ D.heatmap[today()] = (D.heatmap[today()]||0)+1; save(); }
function renderHeatmap(){
    const cont = el('heatmap-container'); if(!cont) return;
    const days = 365; const cells = [];
    for(let i=days-1;i>=0;i--){
        const d = new Date(); d.setDate(d.getDate()-i);
        const ds = d.toISOString().slice(0,10);
        const count = D.heatmap[ds]||0;
        let color = 'var(--bg-input)';
        if(count>=1) color='#0e4429';
        if(count>=3) color='#006d32';
        if(count>=5) color='#26a641';
        if(count>=8) color='#39d353';
        cells.push(`<div class="heatmap-cell" style="background:${color}" title="${ds}: ${count} actions"></div>`);
    }
    cont.innerHTML = cells.join('');
}

// ===== COMMAND PALETTE =====
const COMMANDS = [
    {icon:'ri-dashboard-3-line',name:'แดชบอร์ด',action:()=>nav('dashboard'),key:''},
    {icon:'ri-inbox-2-line',name:'Inbox',action:()=>nav('inbox'),key:''},
    {icon:'ri-sun-line',name:'วันนี้',action:()=>nav('today'),key:''},
    {icon:'ri-layout-column-line',name:'Kanban',action:()=>nav('kanban'),key:''},
    {icon:'ri-grid-line',name:'Eisenhower',action:()=>nav('eisenhower'),key:''},
    {icon:'ri-rocket-2-line',name:'Projects',action:()=>nav('projects'),key:''},
    {icon:'ri-sticky-note-2-line',name:'Knowledge Base',action:()=>nav('notes'),key:''},
    {icon:'ri-mind-map',name:'Knowledge Graph',action:()=>nav('graph'),key:''},
    {icon:'ri-quill-pen-line',name:'Journal',action:()=>nav('journal'),key:''},
    {icon:'ri-heart-pulse-line',name:'Habits',action:()=>nav('habits'),key:''},
    {icon:'ri-bar-chart-2-line',name:'Analytics',action:()=>nav('analytics'),key:''},
    {icon:'ri-money-dollar-circle-line',name:'Finance',action:()=>nav('finance'),key:''},
    {icon:'ri-heart-3-line',name:'Health',action:()=>nav('health'),key:''},
    {icon:'ri-timer-2-line',name:'Time Tracker',action:()=>nav('timetracker'),key:''},
    {icon:'ri-flag-2-line',name:'OKR',action:()=>nav('okr'),key:''},
    {icon:'ri-pie-chart-line',name:'Life Wheel',action:()=>nav('lifewheel'),key:''},
    {icon:'ri-flashlight-line',name:'Quick Capture',action:()=>{closeCmdPalette();openModal('capture-modal')},key:'Ctrl+N'},
    {icon:'ri-focus-3-line',name:'Focus Mode',action:()=>{closeCmdPalette();startFocusMode()},key:'Ctrl+Shift+F'},
    {icon:'ri-palette-line',name:'เปลี่ยนธีม',action:()=>{closeCmdPalette();cycleTheme()},key:'Ctrl+Shift+D'},
    {icon:'ri-download-2-line',name:'Export Data',action:()=>{closeCmdPalette();exportData()},key:'Ctrl+Shift+E'},
    {icon:'ri-upload-2-line',name:'Import Data',action:()=>{closeCmdPalette();importData()},key:''},
    {icon:'ri-file-pdf-line',name:'Weekly Report PDF',action:()=>{closeCmdPalette();generatePDF()},key:''},
];
function openCmdPalette(){ el('cmd-overlay').classList.add('show'); el('cmd-input').value=''; filterCommands(); setTimeout(()=>el('cmd-input').focus(),100); }
function closeCmdPalette(){ el('cmd-overlay').classList.remove('show'); }
function filterCommands(){
    const q = el('cmd-input').value.toLowerCase();
    const filtered = q ? COMMANDS.filter(c=>c.name.toLowerCase().includes(q)) : COMMANDS;
    let html = filtered.map((c,i)=>`
        <div class="cmd-item ${i===0?'active':''}" onclick="runCmd(${COMMANDS.indexOf(c)})"><i class="${c.icon}"></i>${c.name}${c.key?`<span class="cmd-item-key">${c.key}</span>`:''}</div>
    `).join('');

    // Full-text search results
    if (q && q.length >= 2) {
        const searchResults = fullTextSearch(q);
        if (searchResults.length > 0) {
            html += '<div style="padding:6px 14px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;border-top:1px solid var(--border);margin-top:4px">ค้นหาข้อมูล</div>';
            html += searchResults.slice(0,8).map(r => `
                <div class="cmd-item" onclick="nav('${r.page}');closeCmdPalette()"><i class="${r.icon}" style="color:var(--accent-${r.color})"></i>${esc(r.title)}<span class="cmd-item-key">${r.type}</span></div>
            `).join('');
        }
    }
    el('cmd-list').innerHTML = html;
}
function runCmd(idx){ COMMANDS[idx].action(); closeCmdPalette(); }

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', e=>{
    // Ctrl+K
    if(e.ctrlKey && e.key==='k'){ e.preventDefault(); openCmdPalette(); }
    // Ctrl+N
    if(e.ctrlKey && e.key==='n'){ e.preventDefault(); openModal('capture-modal'); }
    // Ctrl+Shift+F
    if(e.ctrlKey && e.shiftKey && e.key==='F'){ e.preventDefault(); startFocusMode(); }
    // Ctrl+Shift+D
    if(e.ctrlKey && e.shiftKey && e.key==='D'){ e.preventDefault(); cycleTheme(); }
    // Ctrl+Shift+E
    if(e.ctrlKey && e.shiftKey && e.key==='E'){ e.preventDefault(); exportData(); }
    // Ctrl+Z
    if(e.ctrlKey && e.key==='z' && !e.shiftKey){ if(document.activeElement.tagName!=='INPUT'&&document.activeElement.tagName!=='TEXTAREA'){e.preventDefault();undoAction();} }
    // ESC
    if(e.key==='Escape'){ closeCmdPalette(); closeShortcuts(); closeDigest(); closeAllModals(); }
    // ?
    if(e.key==='?' && document.activeElement.tagName!=='INPUT' && document.activeElement.tagName!=='TEXTAREA'){ e.preventDefault(); toggleShortcuts(); }
});
function toggleShortcuts(){ el('shortcuts-overlay').classList.toggle('show'); }
function closeShortcuts(){ el('shortcuts-overlay').classList.remove('show'); }

// ===== FOCUS MODE =====
let focusTime=25*60, focusLeft=25*60, focusInterval=null, focusRunning=false;
function startFocusMode(){ el('focus-overlay').classList.add('show'); }
function closeFocusMode(){ el('focus-overlay').classList.remove('show'); if(focusInterval)clearInterval(focusInterval); focusRunning=false; resetFocusTimer(); }
function toggleFocusTimer(){
    if(focusRunning){ clearInterval(focusInterval); focusRunning=false; el('focus-start-btn').innerHTML='<i class="ri-play-line"></i> เริ่ม'; }
    else { focusRunning=true; el('focus-start-btn').innerHTML='<i class="ri-pause-line"></i> หยุด'; focusInterval=setInterval(()=>{
        focusLeft--;
        if(focusLeft<=0){ clearInterval(focusInterval); focusRunning=false; addXP(25); recordHeatmap(); showReminder('Focus session เสร็จแล้ว! 🎉'); resetFocusTimer(); }
        updateFocusDisplay();
    },1000); }
}
function resetFocusTimer(){ focusLeft=focusTime; updateFocusDisplay(); }
function updateFocusDisplay(){
    const m=Math.floor(focusLeft/60); const s=focusLeft%60;
    el('focus-timer').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    const progress = (focusTime-focusLeft)/focusTime;
    el('focus-ring').style.strokeDashoffset = 565.48*(1-progress);
}

// ===== AMBIENT SOUND =====
let currentSound = null;
function setSound(type){
    document.querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('active'));
    event.target.closest('.sound-btn').classList.add('active');
    if(currentSound){currentSound.pause();currentSound=null;}
    // Use Web Audio API for ambient sounds
    if(type!=='none'){
        const audioCtx = new (window.AudioContext||window.webkitAudioContext)();
        // Generate white/pink noise as ambient
        const bufferSize = 2*audioCtx.sampleRate;
        const buffer = audioCtx.createBuffer(1,bufferSize,audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        if(type==='rain'||type==='forest'){
            for(let i=0;i<bufferSize;i++) data[i]=(Math.random()*2-1)*0.15;
        } else if(type==='fire'){
            let b0=0,b1=0;
            for(let i=0;i<bufferSize;i++){const w=Math.random()*2-1;b0=0.99*b0+0.01*w;b1=0.96*b1+0.04*w;data[i]=(b0+b1)*0.5*0.2;}
        } else {
            let b0=0,b1=0,b2=0;
            for(let i=0;i<bufferSize;i++){const w=Math.random()*2-1;b0=0.99886*b0+w*0.0555179;b1=0.99332*b1+w*0.0750759;b2=0.969*b2+w*0.153852;data[i]=(b0+b1+b2)*0.1;}
        }
        const source = audioCtx.createBufferSource();
        source.buffer=buffer;source.loop=true;source.connect(audioCtx.destination);source.start();
        currentSound={pause:()=>{source.stop();audioCtx.close();}};
    }
}

// ===== THEME ENGINE =====
const THEMES = ['midnight','ocean','forest','sunset','sakura','light'];
function cycleTheme(){
    const cur = THEMES.indexOf(D.theme); const next = (cur+1)%THEMES.length;
    D.theme = THEMES[next]; document.documentElement.setAttribute('data-theme',D.theme);
    save(); showReminder('Theme: '+D.theme.charAt(0).toUpperCase()+D.theme.slice(1));
}

// ===== LANGUAGE TOGGLE =====
function toggleLang(){
    D.lang = D.lang==='th'?'en':'th'; el('lang-btn').textContent = D.lang.toUpperCase(); save();
    showReminder('Language: '+(D.lang==='th'?'ไทย':'English'));
}

// ===== DAILY QUOTE =====
const QUOTES = [
    '"อนาคตเป็นของคนที่เชื่อในความงดงามของความฝัน" — Eleanor Roosevelt',
    '"ทุกวันเป็นโอกาสใหม่ ทุกลมหายใจเป็นจุดเริ่มต้นใหม่"',
    '"ความสำเร็จคือการก้าวจากความล้มเหลวสู่ความล้มเหลว โดยไม่สูญเสียความกระตือรือร้น" — Churchill',
    '"สิ่งที่เราทำซ้ำทุกวัน คือตัวเราที่แท้จริง" — Aristotle',
    '"เริ่มต้นจากจุดที่คุณอยู่ ใช้สิ่งที่คุณมี ทำในสิ่งที่คุณทำได้" — Arthur Ashe',
    '"วันนี้ทำดีกว่าเมื่อวาน พรุ่งนี้ทำดีกว่าวันนี้"',
    '"โลกนี้เปลี่ยนแปลงได้ด้วยคนธรรมดาที่ตั้งใจจริง"',
    '"1% ดีขึ้นทุกวัน = 37 เท่าใน 1 ปี"'
];
function showDailyQuote(){
    const idx = Math.floor(new Date().getTime()/86400000)%QUOTES.length;
    el('topbar-quote').textContent = QUOTES[idx];
}

// ===== DAILY DIGEST =====
function showDigest(){
    el('digest-overlay').classList.add('show');
    const todayTasks = D.tasks.filter(t=>t.date===today());
    const pending = todayTasks.filter(t=>!t.done);
    const doneHabits = D.habits.filter(h=>h.days[today()]).length;
    const dueCards = D.srCards.filter(c=>c.nextReview<=today()).length;
    let html = `<div class="digest-section"><h4>📋 งานวันนี้</h4>`;
    if(pending.length) html += pending.map(t=>`<div class="digest-item"><span class="priority-dot ${t.priority}"></span>${esc(t.name)}</div>`).join('');
    else html += `<div class="digest-item">✅ ทำเสร็จหมดแล้ว!</div>`;
    html += `</div>`;
    html += `<div class="digest-section"><h4>💪 นิสัย</h4><div class="digest-item">${doneHabits}/${D.habits.length} สำเร็จวันนี้</div></div>`;
    html += `<div class="digest-section"><h4>🧠 ทบทวน</h4><div class="digest-item">${dueCards} การ์ดรอทบทวน</div></div>`;
    html += `<div class="digest-section"><h4>📦 Inbox</h4><div class="digest-item">${D.inbox.length} รายการรอจัดระเบียบ</div></div>`;
    html += `<div class="digest-section"><h4>🔥 Streak</h4><div class="digest-item">${D.streak} วันติดต่อกัน</div></div>`;
    el('digest-body').innerHTML = html;
}
function closeDigest(){ el('digest-overlay').classList.remove('show'); }

// ===== SMART REMINDERS =====
function showReminder(text){
    el('reminder-text').textContent = text;
    const p = el('reminder-popup'); p.classList.add('show');
    setTimeout(()=>p.classList.remove('show'),3000);
}
// Check reminders every minute
setInterval(()=>{
    const todayTasks = D.tasks.filter(t=>t.date===today()&&!t.done);
    if(todayTasks.length>0 && new Date().getHours()>=18){
        showReminder(`⚠️ ยังมี ${todayTasks.length} งานที่ยังไม่เสร็จ!`);
    }
},60000);

// ===== EXPORT / IMPORT =====
function exportData(){
    const blob = new Blob([JSON.stringify(D,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`secondbrain_backup_${today()}.json`; a.click();
    URL.revokeObjectURL(url); showReminder('Export สำเร็จ!');
}
function importData(){
    const input = document.createElement('input'); input.type='file'; input.accept='.json';
    input.onchange = e=>{
        const reader = new FileReader();
        reader.onload = ()=>{
            try{ D = {...defaultData(),...JSON.parse(reader.result)}; save(); renderAll(); showReminder('Import สำเร็จ!'); }
            catch(err){ showReminder('Import ล้มเหลว!'); }
        };
        reader.readAsText(e.target.files[0]);
    };
    input.click();
}

// ===== WEEKLY REPORT PDF (Simple) =====
function generatePDF(){
    const todayTasks = D.tasks.filter(t=>t.date===today());
    const done = todayTasks.filter(t=>t.done).length;
    const content = `
SECOND BRAIN — WEEKLY REPORT
Date: ${today()}
================================

TASKS: ${done}/${todayTasks.length} completed
HABITS: ${D.habits.filter(h=>h.days[today()]).length}/${D.habits.length}
STREAK: ${D.streak} days
LEVEL: ${D.level} (${D.xp} XP)
INBOX: ${D.inbox.length} items
PROJECTS: ${D.projects.filter(p=>!p.archived).length} active

JOURNAL (Latest):
${D.journals.length>0?D.journals[D.journals.length-1].text:'No entries'}

================================
Generated by Second Brain System
    `;
    const blob = new Blob([content], {type:'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`weekly_report_${today()}.txt`; a.click();
    URL.revokeObjectURL(url); showReminder('Report generated!');
}

// ===== AI DAILY PLAN =====
function generateAIPlan(){
    const tasks = D.tasks.filter(t=>t.date===today()&&!t.done);
    const habits = D.habits.filter(h=>!h.days[today()]);
    const dueCards = D.srCards.filter(c=>c.nextReview<=today()).length;
    const h = new Date().getHours();
    let plan = '<div style="font-size:13px;line-height:2">';
    plan += `<div style="margin-bottom:12px;padding:10px;background:var(--bg-input);border-radius:8px"><strong>🌤️ แผนประจำวัน</strong> — ${today()}</div>`;
    // Morning block
    if(h<12){
        plan += '<div><strong style="color:var(--accent-orange)">🌅 เช้า (พลังงานสูง)</strong></div>';
        const highPri = tasks.filter(t=>t.priority==='high');
        if(highPri.length) highPri.forEach(t=>plan+=`<div>• ${esc(t.name)} <span class="priority-dot high" style="display:inline-block"></span></div>`);
        else plan += '<div>• ไม่มีงานด่วน — เวลาสำหรับ Deep Work!</div>';
    }
    // Afternoon
    plan += '<div style="margin-top:8px"><strong style="color:var(--accent-blue)">☀️ บ่าย (ปานกลาง)</strong></div>';
    const medPri = tasks.filter(t=>t.priority==='medium');
    medPri.forEach(t=>plan+=`<div>• ${esc(t.name)}</div>`);
    if(!medPri.length) plan += '<div>• ว่าง — ทำ Spaced Rep หรืออ่านหนังสือ</div>';
    // Evening
    plan += '<div style="margin-top:8px"><strong style="color:var(--accent-purple)">🌙 เย็น (เบาๆ)</strong></div>';
    const lowPri = tasks.filter(t=>t.priority==='low');
    lowPri.forEach(t=>plan+=`<div>• ${esc(t.name)}</div>`);
    if(habits.length) plan += `<div>• ทำนิสัยที่เหลือ (${habits.length} อย่าง)</div>`;
    if(dueCards) plan += `<div>• ทบทวน Spaced Rep (${dueCards} การ์ด)</div>`;
    plan += '<div>• Evening Ritual + Journal</div>';
    plan += '</div>';
    el('ai-plan').innerHTML = plan;
    addXP(2);
}

// ===== DASHBOARD UPDATE =====
function updateDashboard(){
    const todayTasks = D.tasks.filter(t=>t.date===today());
    el('s-tasks').textContent = todayTasks.filter(t=>!t.done).length;
    el('s-done').textContent = todayTasks.filter(t=>t.done).length;
    el('s-streak').textContent = D.streak;
}

// ===== MODAL HELPERS =====
function openModal(id){ el(id).classList.add('show'); }
function closeModal(id){ el(id).classList.remove('show'); }
function closeAllModals(){ document.querySelectorAll('.modal-overlay.show').forEach(m=>m.classList.remove('show')); }
function showInfoModal(content){
    let m = document.getElementById('info-modal');
    if(!m){
        m=document.createElement('div');m.className='modal-overlay';m.id='info-modal';
        m.innerHTML=`<div class="modal" style="max-width:600px"><div class="modal-header"><h3>รายละเอียด</h3><button class="modal-close" onclick="closeModal('info-modal')"><i class="ri-close-line"></i></button></div><div class="modal-body" id="info-modal-body"></div></div>`;
        document.body.appendChild(m);
    }
    document.getElementById('info-modal-body').innerHTML = content;
    m.classList.add('show');
}

// ===== UTILITY =====
function esc(str){ const d=document.createElement('div');d.textContent=str||'';return d.innerHTML; }

// ===== CLOUD SYNC =====
const SYNC_API = 'https://second-brain-sync.wrangsom.workers.dev';
let syncState = JSON.parse(localStorage.getItem('sb_sync') || 'null');

function getDeviceId() {
    let id = localStorage.getItem('sb_device_id');
    if (!id) { id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); localStorage.setItem('sb_device_id', id); }
    return id;
}

function syncLog(msg, type='info') {
    const el = document.getElementById('sync-log');
    if (!el) return;
    const time = new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
    el.innerHTML = `<div class="sync-log-entry"><span class="sync-log-time">${time}</span><span class="sync-log-msg ${type}">${msg}</span></div>` + el.innerHTML;
    // Keep only 50 entries
    while (el.children.length > 50) el.removeChild(el.lastChild);
}

function clearSyncLog() { const el = document.getElementById('sync-log'); if(el) el.innerHTML = ''; }

function syncToast(msg, isError=false) {
    let t = document.getElementById('sync-toast');
    if (!t) { t = document.createElement('div'); t.id='sync-toast'; t.className='sync-toast'; document.body.appendChild(t); }
    t.className = 'sync-toast' + (isError ? ' error' : '');
    t.innerHTML = `<i class="ri-${isError?'error-warning':'check'}-line" style="color:var(--accent-${isError?'red':'green'});font-size:18px"></i> ${msg}`;
    t.classList.add('show');
    setTimeout(()=>t.classList.remove('show'), 3000);
}

function updateSyncUI() {
    const bar = document.getElementById('sync-status-bar');
    const icon = document.getElementById('sync-status-icon');
    const text = document.getElementById('sync-status-text');
    const sub = document.getElementById('sync-status-sub');
    const notConn = document.getElementById('sync-not-connected');
    const connected = document.getElementById('sync-connected');
    const regForm = document.getElementById('sync-register-form');
    const conForm = document.getElementById('sync-connect-form');

    if (!bar) return;

    if (syncState && syncState.code) {
        bar.className = 'sync-status-bar connected';
        icon.innerHTML = '<i class="ri-cloud-line"></i>';
        text.textContent = 'เชื่อมต่อแล้ว';
        sub.textContent = `Sync Code: ${syncState.code}` + (syncState.lastSync ? ` | Last sync: ${new Date(syncState.lastSync).toLocaleString('th-TH')}` : '');
        notConn.style.display = 'none';
        regForm.style.display = 'none';
        conForm.style.display = 'none';
        connected.style.display = 'block';
        document.getElementById('sync-code-show').textContent = syncState.code;
        document.getElementById('sync-last-time').textContent = syncState.lastSync ? new Date(syncState.lastSync).toLocaleString('th-TH') : 'ยังไม่เคย sync';
        document.getElementById('sync-device-id').textContent = getDeviceId();
    } else {
        bar.className = 'sync-status-bar';
        icon.innerHTML = '<i class="ri-cloud-off-line"></i>';
        text.textContent = 'ยังไม่ได้เชื่อมต่อ';
        sub.textContent = 'สร้าง Sync Code หรือใส่รหัสเพื่อเริ่มต้น';
        notConn.style.display = 'block';
        regForm.style.display = 'none';
        conForm.style.display = 'none';
        connected.style.display = 'none';
    }
}

function showSyncMain() {
    document.getElementById('sync-not-connected').style.display = 'block';
    document.getElementById('sync-register-form').style.display = 'none';
    document.getElementById('sync-connect-form').style.display = 'none';
}
function showSyncRegister() {
    document.getElementById('sync-not-connected').style.display = 'none';
    document.getElementById('sync-register-form').style.display = 'block';
    document.getElementById('sync-connect-form').style.display = 'none';
}
function showSyncConnect() {
    document.getElementById('sync-not-connected').style.display = 'none';
    document.getElementById('sync-register-form').style.display = 'none';
    document.getElementById('sync-connect-form').style.display = 'block';
}

async function registerSync() {
    const pin = document.getElementById('sync-new-pin').value;
    const pin2 = document.getElementById('sync-new-pin2').value;
    if (!pin || pin.length < 4) { syncToast('PIN ต้องมีอย่างน้อย 4 หลัก', true); return; }
    if (pin !== pin2) { syncToast('PIN ไม่ตรงกัน', true); return; }

    const bar = document.getElementById('sync-status-bar');
    bar.className = 'sync-status-bar syncing';
    document.getElementById('sync-status-icon').innerHTML = '<i class="ri-loader-4-line"></i>';
    document.getElementById('sync-status-text').textContent = 'กำลังสร้าง...';
    syncLog('กำลังสร้าง Sync Code...', 'info');

    try {
        const res = await fetch(SYNC_API + '/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');

        syncState = { code: data.code, pin, lastSync: null };
        localStorage.setItem('sb_sync', JSON.stringify(syncState));
        syncLog(`สร้าง Sync Code สำเร็จ: ${data.code}`, 'success');
        syncToast(`สร้างสำเร็จ! Code: ${data.code}`);
        updateSyncUI();
    } catch(e) {
        syncLog('ผิดพลาด: ' + e.message, 'error');
        syncToast(e.message, true);
        updateSyncUI();
    }
}

async function connectSync() {
    const code = document.getElementById('sync-code-input').value.trim().toUpperCase();
    const pin = document.getElementById('sync-pin-input').value;
    if (!code || !pin) { syncToast('กรุณาใส่ Sync Code และ PIN', true); return; }

    const bar = document.getElementById('sync-status-bar');
    bar.className = 'sync-status-bar syncing';
    document.getElementById('sync-status-icon').innerHTML = '<i class="ri-loader-4-line"></i>';
    document.getElementById('sync-status-text').textContent = 'กำลังเชื่อมต่อ...';
    syncLog('กำลังตรวจสอบ Sync Code...', 'info');

    try {
        const res = await fetch(SYNC_API + '/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, pin })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');

        syncState = { code, pin, lastSync: data.lastSync };
        localStorage.setItem('sb_sync', JSON.stringify(syncState));
        syncLog(`เชื่อมต่อสำเร็จ! Code: ${code}`, 'success');
        syncToast('เชื่อมต่อสำเร็จ!');
        updateSyncUI();
    } catch(e) {
        syncLog('ผิดพลาด: ' + e.message, 'error');
        syncToast(e.message, true);
        updateSyncUI();
    }
}

async function syncPush() {
    if (!syncState || !syncState.code) { syncToast('ยังไม่ได้เชื่อมต่อ', true); return; }

    const bar = document.getElementById('sync-status-bar');
    bar.className = 'sync-status-bar syncing';
    document.getElementById('sync-status-icon').innerHTML = '<i class="ri-loader-4-line"></i>';
    document.getElementById('sync-status-text').textContent = 'กำลัง Push...';
    syncLog('กำลังอัปโหลดข้อมูลขึ้น Cloud...', 'info');

    try {
        const res = await fetch(SYNC_API + '/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Sync-Code': syncState.code,
                'X-Sync-Pin': syncState.pin
            },
            body: JSON.stringify({
                data: D,
                timestamp: new Date().toISOString(),
                deviceId: getDeviceId()
            })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Push ล้มเหลว');

        syncState.lastSync = result.timestamp;
        localStorage.setItem('sb_sync', JSON.stringify(syncState));
        syncLog(`Push สำเร็จ! (${(JSON.stringify(D).length/1024).toFixed(1)} KB)`, 'success');
        syncToast('Push ขึ้น Cloud สำเร็จ!');
        updateSyncUI();
    } catch(e) {
        syncLog('Push ผิดพลาด: ' + e.message, 'error');
        syncToast('Push ล้มเหลว: ' + e.message, true);
        updateSyncUI();
    }
}

async function syncPull() {
    if (!syncState || !syncState.code) { syncToast('ยังไม่ได้เชื่อมต่อ', true); return; }
    return syncPullWithConflict();
}

function disconnectSync() {
    if (!confirm('ตัดการเชื่อมต่อ? (ข้อมูลในเครื่องจะยังอยู่)')) return;
    syncState = null;
    localStorage.removeItem('sb_sync');
    syncLog('ตัดการเชื่อมต่อแล้ว', 'info');
    syncToast('ตัดการเชื่อมต่อแล้ว');
    updateSyncUI();
}

function copySyncCode() {
    if (syncState && syncState.code) {
        navigator.clipboard.writeText(syncState.code).then(()=>syncToast('คัดลอก Sync Code แล้ว!')).catch(()=>syncToast('คัดลอกไม่ได้',true));
    }
}

// ===== FEATURE 1: AUTO SYNC =====
let autoSyncTimer = null;
const AUTO_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

function startAutoSync() {
    if (autoSyncTimer) clearInterval(autoSyncTimer);
    if (!syncState || !syncState.code) return;
    autoSyncTimer = setInterval(async () => {
        if (!syncState || !syncState.code || !D.autoSyncEnabled) return;
        syncLog('Auto-sync กำลังทำงาน...', 'info');
        try { await syncPush(); } catch(e) { syncLog('Auto-sync ผิดพลาด: '+e.message, 'error'); }
    }, AUTO_SYNC_INTERVAL);
    syncLog(`Auto-sync เปิดทุก ${AUTO_SYNC_INTERVAL/60000} นาที`, 'info');
}

function toggleAutoSync() {
    D.autoSyncEnabled = !D.autoSyncEnabled;
    save();
    if (D.autoSyncEnabled) { startAutoSync(); syncToast('เปิด Auto-sync แล้ว'); }
    else { if(autoSyncTimer) clearInterval(autoSyncTimer); syncToast('ปิด Auto-sync แล้ว'); }
    updateAutoSyncUI();
}

function updateAutoSyncUI() {
    const btn = document.getElementById('auto-sync-toggle');
    if (btn) {
        btn.className = D.autoSyncEnabled ? 'btn btn-sm btn-success' : 'btn btn-sm btn-secondary';
        btn.innerHTML = `<i class="ri-${D.autoSyncEnabled?'check':'close'}-line"></i> Auto-sync: ${D.autoSyncEnabled?'ON':'OFF'}`;
    }
}

// Sync on page close/hide
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && syncState && syncState.code && D.autoSyncEnabled) {
        // Use sendBeacon for reliable sync on page close
        const payload = JSON.stringify({
            data: D, timestamp: new Date().toISOString(), deviceId: getDeviceId()
        });
        navigator.sendBeacon && navigator.sendBeacon(
            SYNC_API + '/push-beacon?code=' + syncState.code + '&pin=' + syncState.pin,
            new Blob([payload], { type: 'application/json' })
        );
    }
});

// Auto-sync on page load if connected
function autoSyncCheck() {
    updateSyncUI();
    updateAutoSyncUI();
    if (syncState && syncState.code) {
        if (D.autoSyncEnabled) startAutoSync();
        if (syncState.lastSync) {
            const last = new Date(syncState.lastSync).getTime();
            if (Date.now() - last > AUTO_SYNC_INTERVAL) {
                syncLog('ข้อมูลอาจไม่ตรงกัน — กำลัง auto-pull...', 'info');
            }
        }
    }
}
setTimeout(autoSyncCheck, 1000);

// ===== FEATURE 2: CONFLICT RESOLUTION =====
async function syncPullWithConflict() {
    if (!syncState || !syncState.code) { syncToast('ยังไม่ได้เชื่อมต่อ', true); return; }

    try {
        const res = await fetch(SYNC_API + '/pull', {
            method: 'POST',
            headers: { 'Content-Type':'application/json', 'X-Sync-Code':syncState.code, 'X-Sync-Pin':syncState.pin }
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        if (!result.data) { syncToast('ยังไม่มีข้อมูลบน Cloud', true); return; }

        const cloudTime = new Date(result.pushedAt).getTime();
        const localTime = new Date(D.lastModified || 0).getTime();

        if (Math.abs(cloudTime - localTime) < 5000) {
            syncToast('ข้อมูลตรงกันแล้ว'); return;
        }

        if (localTime > cloudTime) {
            showConflictDialog(result.data, result.pushedAt, result.deviceId);
        } else {
            // Cloud is newer, auto-apply
            Object.assign(D, result.data);
            save(); renderAll();
            syncState.lastSync = result.pushedAt;
            localStorage.setItem('sb_sync', JSON.stringify(syncState));
            syncLog('Pull สำเร็จ (Cloud ใหม่กว่า)', 'success');
            syncToast('ข้อมูลอัปเดตจาก Cloud แล้ว');
            updateSyncUI();
        }
    } catch(e) {
        syncLog('Pull ผิดพลาด: '+e.message, 'error');
        syncToast('Pull ล้มเหลว', true);
    }
}

function showConflictDialog(cloudData, cloudTime, cloudDevice) {
    const overlay = document.getElementById('conflict-overlay');
    if (!overlay) return;
    const localCount = D.tasks.length + D.notes.length + D.journals.length;
    const cloudCount = (cloudData.tasks||[]).length + (cloudData.notes||[]).length + (cloudData.journals||[]).length;
    document.getElementById('conflict-local-info').innerHTML =
        `<strong>เครื่องนี้</strong><br>แก้ไขล่าสุด: ${new Date(D.lastModified).toLocaleString('th-TH')}<br>รายการ: ${localCount} items<br>Device: ${getDeviceId()}`;
    document.getElementById('conflict-cloud-info').innerHTML =
        `<strong>Cloud</strong><br>อัปโหลดเมื่อ: ${new Date(cloudTime).toLocaleString('th-TH')}<br>รายการ: ${cloudCount} items<br>Device: ${cloudDevice||'unknown'}`;
    overlay.classList.add('show');
    window._conflictCloudData = cloudData;
    window._conflictCloudTime = cloudTime;
}

function resolveConflict(choice) {
    const overlay = document.getElementById('conflict-overlay');
    if (overlay) overlay.classList.remove('show');

    if (choice === 'cloud') {
        Object.assign(D, window._conflictCloudData);
        save(); renderAll();
        syncLog('เลือกใช้ข้อมูลจาก Cloud', 'success');
        syncToast('ใช้ข้อมูลจาก Cloud แล้ว');
    } else if (choice === 'local') {
        syncPush();
        syncLog('เลือกใช้ข้อมูลในเครื่อง + Push ขึ้น Cloud', 'success');
    } else if (choice === 'merge') {
        mergeData(window._conflictCloudData);
        syncLog('รวมข้อมูลทั้งสองเครื่อง', 'success');
        syncToast('รวมข้อมูลสำเร็จ!');
    }
    syncState.lastSync = new Date().toISOString();
    localStorage.setItem('sb_sync', JSON.stringify(syncState));
    updateSyncUI();
}

function mergeData(cloudData) {
    // Merge arrays: add items from cloud that don't exist locally (by id)
    ['inbox','tasks','projects','areas','notes','habits','journals','srCards','books','finances','okrs','visions','reviews','timeEntries'].forEach(key => {
        if (!Array.isArray(cloudData[key])) return;
        const localIds = new Set((D[key]||[]).map(x=>x.id));
        cloudData[key].forEach(item => {
            if (!localIds.has(item.id)) { D[key].push(item); }
        });
    });
    // Merge trash
    if (Array.isArray(cloudData.trash)) {
        const localTrashIds = new Set((D.trash||[]).map(x=>x.item?.id));
        cloudData.trash.forEach(t => { if (!localTrashIds.has(t.item?.id)) D.trash.push(t); });
    }
    // Keep higher XP/level
    if ((cloudData.xp||0) > D.xp) { D.xp = cloudData.xp; D.level = cloudData.level; }
    // Merge heatmap (keep higher values)
    if (cloudData.heatmap) { Object.entries(cloudData.heatmap).forEach(([k,v])=>{ if(!D.heatmap[k] || v > D.heatmap[k]) D.heatmap[k]=v; }); }
    save(); renderAll();
}

// ===== FEATURE 3: MOBILE RESPONSIVE =====
function initMobile() {
    // Add hamburger menu button
    const topbar = document.querySelector('.topbar-left');
    if (topbar && window.innerWidth <= 768) {
        if (!document.getElementById('mobile-menu-btn')) {
            const btn = document.createElement('button');
            btn.id = 'mobile-menu-btn';
            btn.className = 'topbar-btn mobile-menu-btn';
            btn.innerHTML = '<i class="ri-menu-line"></i>';
            btn.onclick = toggleMobileSidebar;
            topbar.insertBefore(btn, topbar.firstChild);
        }
    }
    // Close sidebar on nav click (mobile)
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                document.querySelector('.sidebar').classList.remove('open');
                document.getElementById('sidebar-backdrop')?.remove();
            }
        });
    });
}

function toggleMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('open');
    let backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar.classList.contains('open')) {
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'sidebar-backdrop';
            backdrop.className = 'sidebar-backdrop';
            backdrop.onclick = () => { sidebar.classList.remove('open'); backdrop.remove(); };
            document.body.appendChild(backdrop);
        }
    } else {
        if (backdrop) backdrop.remove();
    }
}

window.addEventListener('resize', initMobile);
document.addEventListener('DOMContentLoaded', () => setTimeout(initMobile, 200));

// ===== FEATURE 4: BROWSER PUSH NOTIFICATIONS =====
async function requestNotificationPermission() {
    if (!('Notification' in window)) { syncToast('เบราว์เซอร์ไม่รองรับ Notification', true); return; }
    const perm = await Notification.requestPermission();
    D.notificationsEnabled = (perm === 'granted');
    save();
    updateNotifUI();
    if (perm === 'granted') syncToast('เปิดการแจ้งเตือนสำเร็จ!');
    else syncToast('การแจ้งเตือนถูกปฏิเสธ', true);
}

function sendNotification(title, body, icon='🧠') {
    if (!D.notificationsEnabled || Notification.permission !== 'granted') return;
    try {
        new Notification(title, { body, icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">'+icon+'</text></svg>', badge: icon });
    } catch(e) {}
}

function updateNotifUI() {
    const btn = document.getElementById('notif-toggle');
    if (btn) {
        btn.className = D.notificationsEnabled ? 'btn btn-sm btn-success' : 'btn btn-sm btn-secondary';
        btn.innerHTML = `<i class="ri-notification-${D.notificationsEnabled?'3':'off'}-line"></i> แจ้งเตือน: ${D.notificationsEnabled?'ON':'OFF'}`;
    }
}

// Check deadlines and remind
function checkDeadlineNotifications() {
    if (!D.notificationsEnabled) return;
    const todayStr = today();
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
    const tomorrowStr = tomorrow.toISOString().slice(0,10);

    // Projects with approaching deadlines
    D.projects.forEach(p => {
        if (p.deadline === todayStr) sendNotification('⚠️ เดดไลน์วันนี้!', p.name, '🔥');
        else if (p.deadline === tomorrowStr) sendNotification('📅 เดดไลน์พรุ่งนี้', p.name, '⏰');
    });

    // Incomplete habits
    const incompleteHabits = D.habits.filter(h => !(h.days||{})[todayStr]);
    if (incompleteHabits.length > 0) {
        sendNotification('💪 นิสัยที่ยังไม่ได้ทำ', incompleteHabits.map(h=>h.name).join(', '), '🎯');
    }

    // High priority tasks not done
    const urgentTasks = D.tasks.filter(t => !t.done && t.priority === 'high' && t.date === todayStr);
    if (urgentTasks.length > 0) {
        sendNotification('🔴 งานสำคัญมากค้างอยู่', urgentTasks.map(t=>t.name).join(', '), '⚡');
    }
}

// Schedule notification checks
function scheduleNotifications() {
    // Check at 8 AM, 12 PM, 6 PM
    const now = new Date();
    const checkTimes = [8, 12, 18];
    checkTimes.forEach(hour => {
        const target = new Date(now);
        target.setHours(hour, 0, 0, 0);
        if (target > now) {
            setTimeout(() => {
                checkDeadlineNotifications();
                // Re-schedule for next day
                setTimeout(scheduleNotifications, 60000);
            }, target - now);
        }
    });
}
setTimeout(() => { if (D.notificationsEnabled) scheduleNotifications(); }, 2000);

// ===== FEATURE 5: FULL-TEXT SEARCH =====
function fullTextSearch(query) {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const results = [];

    // Search tasks
    D.tasks.forEach(t => {
        if (t.name.toLowerCase().includes(q)) results.push({ type:'task', icon:'ri-task-line', color:'blue', title:t.name, sub:`งาน • ${t.done?'เสร็จ':'ยังไม่เสร็จ'}`, page:'today', data:t });
    });

    // Search notes
    D.notes.forEach(n => {
        if ((n.title||'').toLowerCase().includes(q) || (n.content||'').toLowerCase().includes(q))
            results.push({ type:'note', icon:'ri-sticky-note-2-line', color:'purple', title:n.title, sub:`โน้ต • ${(n.tags||[]).join(', ')}`, page:'notes', data:n });
    });

    // Search projects
    D.projects.forEach(p => {
        if (p.name.toLowerCase().includes(q) || (p.desc||'').toLowerCase().includes(q))
            results.push({ type:'project', icon:'ri-rocket-2-line', color:'orange', title:p.name, sub:`โปรเจกต์ • ${p.deadline||''}`, page:'projects', data:p });
    });

    // Search journals
    D.journals.forEach(j => {
        if ((j.text||'').toLowerCase().includes(q))
            results.push({ type:'journal', icon:'ri-quill-pen-line', color:'pink', title:j.date, sub:`Journal • ${(j.text||'').slice(0,60)}...`, page:'journal', data:j });
    });

    // Search inbox
    D.inbox.forEach(i => {
        if (i.text.toLowerCase().includes(q))
            results.push({ type:'inbox', icon:'ri-inbox-2-line', color:'cyan', title:i.text, sub:'Inbox', page:'inbox', data:i });
    });

    // Search books
    D.books.forEach(b => {
        if ((b.title||'').toLowerCase().includes(q) || (b.author||'').toLowerCase().includes(q))
            results.push({ type:'book', icon:'ri-book-open-line', color:'green', title:b.title, sub:`หนังสือ • ${b.author}`, page:'reading', data:b });
    });

    // Search finance
    D.finances.forEach(f => {
        if ((f.desc||'').toLowerCase().includes(q))
            results.push({ type:'finance', icon:'ri-money-dollar-circle-line', color:'yellow', title:f.desc, sub:`${f.type==='income'?'รายรับ':'รายจ่าย'} • ฿${fmt(f.amount)}`, page:'finance', data:f });
    });

    // Search areas
    D.areas.forEach(a => {
        if (a.name.toLowerCase().includes(q))
            results.push({ type:'area', icon:'ri-compass-3-line', color:'green', title:a.name, sub:'Area', page:'areas', data:a });
    });

    return results;
}

function renderSearchResults(query) {
    const results = fullTextSearch(query);
    const container = document.getElementById('search-results');
    if (!container) return;

    if (!query || query.length < 2) {
        container.style.display = 'none'; return;
    }

    container.style.display = 'block';
    if (results.length === 0) {
        container.innerHTML = '<div class="search-empty"><i class="ri-search-line"></i> ไม่พบผลลัพธ์</div>';
        return;
    }

    container.innerHTML = `<div class="search-count">${results.length} ผลลัพธ์</div>` +
        results.slice(0, 20).map(r => `
            <div class="search-result-item" onclick="nav('${r.page}');document.getElementById('search-results').style.display='none'">
                <div class="search-result-icon" style="color:var(--accent-${r.color})"><i class="${r.icon}"></i></div>
                <div class="search-result-info">
                    <div class="search-result-title">${esc(r.title)}</div>
                    <div class="search-result-sub">${esc(r.sub)}</div>
                </div>
                <div class="search-result-type">${r.type}</div>
            </div>
        `).join('');
}

// ===== FEATURE 6: RECYCLE BIN (TRASH) =====
function moveToTrash(source, item) {
    if (!D.trash) D.trash = [];
    D.trash.push({
        source,
        item: {...item},
        deletedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30*24*60*60*1000).toISOString()
    });
    // Keep max 100 items in trash
    while (D.trash.length > 100) D.trash.shift();
    save();
}

function restoreFromTrash(idx) {
    if (!D.trash || !D.trash[idx]) return;
    const entry = D.trash[idx];
    const target = D[entry.source];
    if (Array.isArray(target)) {
        target.push(entry.item);
        D.trash.splice(idx, 1);
        save(); renderAll(); renderTrash();
        syncToast(`กู้คืน "${entry.item.name || entry.item.text || entry.item.title || 'รายการ'}" สำเร็จ!`);
        addXP(1);
    }
}

function permanentDelete(idx) {
    if (!D.trash || !D.trash[idx]) return;
    if (!confirm('ลบถาวร? ไม่สามารถกู้คืนได้')) return;
    D.trash.splice(idx, 1);
    save(); renderTrash();
}

function emptyTrash() {
    if (!confirm('ล้างถังขยะทั้งหมด? ไม่สามารถกู้คืนได้')) return;
    D.trash = [];
    save(); renderTrash();
    syncToast('ล้างถังขยะแล้ว');
}

function cleanExpiredTrash() {
    if (!D.trash) return;
    const now = Date.now();
    D.trash = D.trash.filter(t => new Date(t.expiresAt).getTime() > now);
    save();
}

function renderTrash() {
    const list = document.getElementById('trash-list');
    if (!list) return;
    cleanExpiredTrash();
    const trash = D.trash || [];
    document.getElementById('trash-count').textContent = trash.length;

    if (trash.length === 0) {
        list.innerHTML = '<div class="empty-state"><i class="ri-delete-bin-line" style="font-size:48px;color:var(--text-muted)"></i><p style="color:var(--text-secondary);margin-top:8px">ถังขยะว่าง</p></div>';
        return;
    }

    list.innerHTML = trash.map((t, i) => {
        const name = t.item.name || t.item.text || t.item.title || 'รายการ';
        const daysLeft = Math.ceil((new Date(t.expiresAt).getTime() - Date.now()) / (24*60*60*1000));
        const sourceLabel = {inbox:'Inbox',tasks:'งาน',projects:'โปรเจกต์',notes:'โน้ต',habits:'นิสัย',books:'หนังสือ'}[t.source] || t.source;
        return `<div class="trash-item">
            <div class="trash-item-info">
                <div class="trash-item-name">${esc(name)}</div>
                <div class="trash-item-meta">จาก ${sourceLabel} • ลบเมื่อ ${new Date(t.deletedAt).toLocaleDateString('th-TH')} • เหลือ ${daysLeft} วัน</div>
            </div>
            <div class="trash-item-actions">
                <button class="btn btn-sm btn-success" onclick="restoreFromTrash(${i})"><i class="ri-arrow-go-back-line"></i> กู้คืน</button>
                <button class="btn btn-sm btn-danger" onclick="permanentDelete(${i})"><i class="ri-delete-bin-line"></i></button>
            </div>
        </div>`;
    }).join('');
}

// ===== FEATURE 7: WEEKLY PDF REPORT =====
function generateWeeklyPDF() {
    const todayDate = new Date();
    const weekAgo = new Date(todayDate.getTime() - 7*24*60*60*1000);

    const tasksCompleted = D.tasks.filter(t => t.done).length;
    const tasksPending = D.tasks.filter(t => !t.done).length;
    const habitsThisWeek = D.habits.reduce((sum, h) => {
        return sum + Object.keys(h.days||{}).filter(d => new Date(d) >= weekAgo).length;
    }, 0);
    const journalsThisWeek = D.journals.filter(j => new Date(j.date) >= weekAgo).length;
    const finIncome = D.finances.filter(f => f.type==='income' && new Date(f.date) >= weekAgo).reduce((s,f) => s+f.amount, 0);
    const finExpense = D.finances.filter(f => f.type==='expense' && new Date(f.date) >= weekAgo).reduce((s,f) => s+f.amount, 0);

    // Create printable HTML
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Weekly Report - Second Brain</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Segoe UI',Tahoma,sans-serif;padding:40px;color:#1a1a2e;line-height:1.6}
        h1{font-size:28px;margin-bottom:4px;color:#4a7dff}
        .subtitle{color:#666;margin-bottom:30px;font-size:14px}
        .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:30px}
        .stat{background:#f8f9fa;border-radius:12px;padding:20px;text-align:center}
        .stat-val{font-size:32px;font-weight:700;color:#4a7dff}
        .stat-label{font-size:12px;color:#666;margin-top:4px}
        h2{font-size:18px;color:#1a1a2e;margin:24px 0 12px;padding-bottom:6px;border-bottom:2px solid #4a7dff}
        table{width:100%;border-collapse:collapse;margin-bottom:20px}
        th{background:#4a7dff;color:white;padding:8px 12px;text-align:left;font-size:12px}
        td{padding:8px 12px;border-bottom:1px solid #eee;font-size:13px}
        tr:nth-child(even){background:#f8f9fa}
        .footer{margin-top:40px;text-align:center;color:#999;font-size:11px;border-top:1px solid #eee;padding-top:16px}
        .mood-row{display:flex;gap:8px;margin-bottom:8px}
        @media print{body{padding:20px}}
    </style></head><body>
        <h1>📊 Weekly Report</h1>
        <p class="subtitle">${weekAgo.toLocaleDateString('th-TH')} — ${todayDate.toLocaleDateString('th-TH')} | Level ${D.level} • ${D.xp} XP</p>

        <div class="grid">
            <div class="stat"><div class="stat-val">${tasksCompleted}</div><div class="stat-label">งานเสร็จ</div></div>
            <div class="stat"><div class="stat-val">${tasksPending}</div><div class="stat-label">งานค้าง</div></div>
            <div class="stat"><div class="stat-val">${D.streak}</div><div class="stat-label">วัน Streak</div></div>
            <div class="stat"><div class="stat-val">${habitsThisWeek}</div><div class="stat-label">Habit Checks</div></div>
            <div class="stat"><div class="stat-val">${journalsThisWeek}</div><div class="stat-label">Journal Entries</div></div>
            <div class="stat"><div class="stat-val">฿${fmt(finIncome - finExpense)}</div><div class="stat-label">Net Income</div></div>
        </div>

        <h2>📋 งานที่เสร็จแล้ว</h2>
        <table><tr><th>งาน</th><th>Priority</th><th>วันที่</th></tr>
        ${D.tasks.filter(t=>t.done).slice(-10).map(t=>`<tr><td>${esc(t.name)}</td><td>${t.priority}</td><td>${t.date}</td></tr>`).join('')}
        </table>

        <h2>🚀 โปรเจกต์</h2>
        <table><tr><th>ชื่อ</th><th>Progress</th><th>Deadline</th></tr>
        ${D.projects.map(p=>`<tr><td>${p.emoji||''} ${esc(p.name)}</td><td>${p.progress||0}%</td><td>${p.deadline||'-'}</td></tr>`).join('')}
        </table>

        <h2>💰 การเงิน</h2>
        <table><tr><th>รายรับ</th><th>รายจ่าย</th><th>คงเหลือ</th></tr>
        <tr><td style="color:green">฿${fmt(finIncome)}</td><td style="color:red">฿${fmt(finExpense)}</td><td><strong>฿${fmt(finIncome-finExpense)}</strong></td></tr>
        </table>

        <h2>📝 Journal สัปดาห์นี้</h2>
        ${D.journals.filter(j=>new Date(j.date)>=weekAgo).map(j=>`<div class="mood-row"><strong>${j.date}</strong> ${j.mood||''} — ${esc((j.text||'').slice(0,100))}</div>`).join('') || '<p>ไม่มีบันทึก</p>'}

        <div class="footer">Generated by Second Brain — ${new Date().toLocaleString('th-TH')}</div>
    </body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
    addXP(5);
    syncToast('สร้าง Weekly Report สำเร็จ!');
}

// ===== FEATURE 8: NOTION / GOOGLE CAL INTEGRATION STUBS =====
function openIntegrations() {
    const overlay = document.getElementById('integrations-overlay');
    if (overlay) overlay.classList.add('show');
}
function closeIntegrations() {
    const overlay = document.getElementById('integrations-overlay');
    if (overlay) overlay.classList.remove('show');
}

// ===== PWA =====
if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
}
