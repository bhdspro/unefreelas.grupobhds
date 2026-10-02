if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}

const apiUrl = 'https://api.unefreelas.grupobhds.com';

const views = document.querySelectorAll('.view');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const modals = document.querySelectorAll('.modal');
const btnLoginModal = document.getElementById('btn-login-modal');
const modalLogin = document.getElementById('modal-login');
const modalCadastro = document.getElementById('modal-cadastro');
const inputSenha = document.getElementById('input-senha');
const btnCloseModals = document.querySelectorAll('.btn-close-modal');

let state = { horarios: [], demandas: [], diaristas: [], currentRole: null, currentDemandaId: null };
let pollingInterval;

async function fetchState() {
  try {
    const res = await fetch(`${apiUrl}/sync`);
    const data = await res.json();
    state.horarios = data.horarios || [];
    state.demandas = data.demandas || [];
    state.diaristas = data.diaristas || [];
    refreshActiveView();
  } catch(e) {}
}

function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(fetchState, 5000);
}

function refreshActiveView() {
  if (document.getElementById('view-home').classList.contains('active')) renderHome();
  if (document.getElementById('view-admin').classList.contains('active')) renderAdmin();
  if (document.getElementById('view-gestor').classList.contains('active')) renderGestor();
}

async function init() {
  await fetchState();
  startPolling();
  const cpf = localStorage.getItem('unefreelas_cpf');
  if (cpf) {
    const d = state.diaristas.find(x => x.cpf === cpf);
    if (d && d.isFixo) {
      switchView('view-diarista-fixo');
    } else {
      switchView('view-diarista-normal');
    }
  } else {
    switchView('view-home');
  }
}

function switchView(viewId) {
  views.forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  refreshActiveView();
}

function switchTab(tabId) {
  tabContents.forEach(t => t.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
}

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const parentNav = btn.parentElement;
    parentNav.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    switchTab(btn.dataset.target);
  });
});

btnLoginModal.addEventListener('click', () => { modalLogin.classList.add('active'); });

btnCloseModals.forEach(btn => {
  btn.addEventListener('click', () => { modals.forEach(m => m.classList.remove('active')); });
});

document.getElementById('btn-login-submit').addEventListener('click', async () => {
  const senha = inputSenha.value;
  try {
    const res = await fetch(`${apiUrl}/auth`, {
      method: 'POST',
      body: JSON.stringify({ senha }),
      headers: { 'Content-Type': 'application/json' }
    });
    const authData = await res.json();
    if (authData.role === 'admin') {
      state.currentRole = 'admin';
      switchView('view-admin');
      modalLogin.classList.remove('active');
    } else if (authData.role === 'gestor') {
      state.currentRole = 'gestor';
      switchView('view-gestor');
      modalLogin.classList.remove('active');
    } else {
      alert('Senha incorreta!');
    }
  } catch(e) {
    alert('Erro ao autenticar.');
  }
});

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function calcCH(e, s, i) {
  const start = timeToMinutes(e);
  let end = timeToMinutes(s);
  if (end < start) end += 24 * 60;
  const t = end - start - i;
  return `${Math.floor(t / 60)}h${t % 60 > 0 ? t % 60 + 'm' : ''}`;
}

function maskCpf(cpfRaw) {
  const c = cpfRaw.replace(/\D/g, '');
  if (c.length === 11) {
    return `${c.substring(0,3)}.***.***-${c.substring(9,11)}`;
  }
  return '***.***.***-**';
}

function hasConflict(demandaId, cpf) {
  const newD = state.demandas.find(x => x.id === demandaId);
  const newH = state.horarios.find(x => x.id === newD.horarioId);
  const nStart = timeToMinutes(newH.entrada);
  let nEnd = timeToMinutes(newH.saida);
  if (nEnd < nStart) nEnd += 24 * 60;

  for (let d of state.demandas) {
    if (d.confirmados && d.confirmados.find(c => c.cpf === cpf)) {
      const eH = state.horarios.find(x => x.id === d.horarioId);
      const eStart = timeToMinutes(eH.entrada);
      let eEnd = timeToMinutes(eH.saida);
      if (eEnd < eStart) eEnd += 24 * 60;

      if (nStart < eEnd && eStart < nEnd) return true;
    }
  }
  return false;
}

function renderHome() {
  const list = document.getElementById('home-slots');
  list.innerHTML = '';
  state.demandas.forEach(d => {
    const h = state.horarios.find(x => x.id === d.horarioId);
    if (!h) return;
    const isFull = (d.confirmados ? d.confirmados.length : 0) >= d.vagas;
    const preenchidas = d.confirmados ? d.confirmados.length : 0;
    
    let htmlPessoas = '';
    if (d.confirmados && d.confirmados.length > 0) {
      htmlPessoas = `<div class="pessoas-confirmadas">`;
      d.confirmados.forEach(c => {
        htmlPessoas += `<span class="pessoa-tag">${c.nome.split(' ')[0]} - ${maskCpf(c.cpf)}</span>`;
      });
      htmlPessoas += `</div>`;
    }

    list.innerHTML += `
      <div class="list-item">
        <div class="list-item-row">
          <div>
            <h4>${h.entrada} - ${h.saida}</h4>
            <p>CH: ${h.carga} | Vagas: ${preenchidas}/${d.vagas}</p>
          </div>
          <button class="${isFull ? 'btn-secondary' : 'btn-primary'}" style="width:auto; margin:0;" ${isFull ? 'disabled' : ''} onclick="abrirConfirmacao('${d.id}')">
            ${isFull ? 'Esgotado' : 'Confirmar'}
          </button>
        </div>
        ${htmlPessoas}
      </div>
    `;
  });
}

function renderAdmin() {
  const sel = document.getElementById('demanda-horario');
  sel.innerHTML = '<option value="">Selecione</option>';
  state.horarios.forEach(h => sel.innerHTML += `<option value="${h.id}">${h.entrada} às ${h.saida}</option>`);
  
  const lH = document.getElementById('lista-horarios');
  lH.innerHTML = '';
  state.horarios.forEach(h => {
    lH.innerHTML += `<div class="list-item"><h4>${h.entrada} - ${h.saida}</h4><p>Intervalo: ${h.intervalo}m | CH: ${h.carga}</p></div>`;
  });

  const lD = document.getElementById('lista-demandas');
  lD.innerHTML = '';
  state.demandas.forEach(d => {
    const h = state.horarios.find(x => x.id === d.horarioId);
    lD.innerHTML += `<div class="list-item"><h4>${h.entrada} - ${h.saida}</h4><p>Vagas Totais: ${d.vagas}</p></div>`;
  });
}

document.getElementById('form-horario').addEventListener('submit', async (e) => {
  e.preventDefault();
  const obj = {
    id: Date.now().toString(),
    entrada: document.getElementById('horario-entrada').value,
    saida: document.getElementById('horario-saida').value,
    intervalo: parseInt(document.getElementById('horario-intervalo').value)
  };
  obj.carga = calcCH(obj.entrada, obj.saida, obj.intervalo);
  state.horarios.push(obj);
  await fetch(`${apiUrl}/horarios`, { method: 'POST', body: JSON.stringify(state.horarios) });
  renderAdmin();
  e.target.reset();
});

document.getElementById('form-demanda').addEventListener('submit', async (e) => {
  e.preventDefault();
  const obj = {
    id: Date.now().toString(),
    horarioId: document.getElementById('demanda-horario').value,
    vagas: parseInt(document.getElementById('demanda-vagas').value),
    confirmados: []
  };
  state.demandas.push(obj);
  await fetch(`${apiUrl}/demandas`, { method: 'POST', body: JSON.stringify(state.demandas) });
  renderAdmin();
  e.target.reset();
});

function abrirConfirmacao(demandaId) {
  state.currentDemandaId = demandaId;
  const cpf = localStorage.getItem('unefreelas_cpf');
  if (!cpf) {
    modalCadastro.classList.add('active');
  } else {
    processarConfirmacao(cpf, localStorage.getItem('unefreelas_nome'));
  }
}

document.getElementById('btn-cad-submit').addEventListener('click', async () => {
  const cpf = document.getElementById('cad-cpf').value;
  const nome = document.getElementById('cad-nome').value;
  const zap = document.getElementById('cad-whatsapp').value;
  
  if (!state.diaristas.find(x => x.cpf === cpf)) {
    state.diaristas.push({ id: Date.now().toString(), cpf, nome, zap, isFixo: false, isBloqueado: false });
    await fetch(`${apiUrl}/diaristas`, { method: 'POST', body: JSON.stringify(state.diaristas) });
  }
  localStorage.setItem('unefreelas_cpf', cpf);
  localStorage.setItem('unefreelas_nome', nome);
  modalCadastro.classList.remove('active');
  processarConfirmacao(cpf, nome);
});

async function processarConfirmacao(cpf, nome) {
  const diarista = state.diaristas.find(x => x.cpf === cpf);
  if (diarista && diarista.isBloqueado) {
    alert('Operação não permitida neste momento.');
    return;
  }
  if (hasConflict(state.currentDemandaId, cpf)) {
    alert('Você já possui um turno confirmado que conflita com este horário!');
    return;
  }
  
  const d = state.demandas.find(x => x.id === state.currentDemandaId);
  if (!d.confirmados) d.confirmados = [];
  if (d.confirmados.find(c => c.cpf === cpf)) return;
  
  if (d.confirmados.length < d.vagas) {
    d.confirmados.push({ cpf, nome });
    await fetch(`${apiUrl}/demandas`, { method: 'POST', body: JSON.stringify(state.demandas) });
    await fetch(`${apiUrl}/log`, { method: 'POST', body: JSON.stringify({ cpf, nome, demandaId: d.id, data: new Date().toISOString() }) });
    fetchState();
  }
}

function renderGestor() {
  const p = document.getElementById('tabela-presenca');
  p.innerHTML = '';
  state.demandas.forEach(d => {
    if (d.confirmados) {
      d.confirmados.forEach(c => {
        p.innerHTML += `<div class="list-item"><h4>${c.nome} (${maskCpf(c.cpf)})</h4><div class="list-item-row"><input type="time" placeholder="Entrada"><input type="time" placeholder="Saída"></div></div>`;
      });
    }
  });
}

init();