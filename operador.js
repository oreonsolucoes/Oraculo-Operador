// ========== IMPORTAR FIREBASE ==========
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getDatabase, ref, onValue, set, push, remove, get } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

// ========== CONFIGURAÇÃO FIREBASE ==========
const firebaseConfig = {
    apiKey: "AIzaSyDvvW3MMxvVNb7PyhYbaR3mdsygfcy0Ghw",
    authDomain: "oraculo-v1.firebaseapp.com",
    projectId: "oraculo-v1",
    storageBucket: "oraculo-v1.firebasestorage.app",
    messagingSenderId: "1052381946693",
    appId: "1:1052381946693:web:50f57501024c28e8f3142c",
    measurementId: "G-K2DQPQEPSC"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ========== CONSTANTES ==========
const CONDOMINIO_ID = "cond_eucaliptos";
const LIMIAR_MS = 500;
const OFFLINE_SE_ULTIMO_UPDATE_MAIOR_QUE = 120;

// ========== VARIÁVEIS GLOBAIS ==========
let setoresData = {};
let locaisData = {};
let equipamentosData = {};
let subequipamentosData = {};
let monitoramentoData = {};
let chamadosData = {};
let historicoOfflineData = {};

let editandoId = null;
let editandoTipo = null;
let localSelecionadoStatus = null;
let periodoGraficoAtual = '30min';
let equipamentoGraficoAtual = null;

// ========== SISTEMA DE PARTÍCULAS ==========
class ParticleSystem {
    constructor() {
        this.canvas = document.getElementById('particles');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.particleCount = 80;
        this.connectionDistance = 150;

        this.resize();
        this.init();
        this.animate();

        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    init() {
        this.particles = [];
        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                radius: Math.random() * 2 + 1
            });
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.particles.forEach((p, i) => {
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = 'rgba(124, 140, 255, 0.5)';
            this.ctx.fill();

            for (let j = i + 1; j < this.particles.length; j++) {
                const p2 = this.particles[j];
                const dx = p.x - p2.x;
                const dy = p.y - p2.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < this.connectionDistance) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.strokeStyle = `rgba(124, 140, 255, ${0.2 * (1 - distance / this.connectionDistance)})`;
                    this.ctx.lineWidth = 0.5;
                    this.ctx.stroke();
                }
            }
        });

        requestAnimationFrame(() => this.animate());
    }
}

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', () => {
    new ParticleSystem();
    inicializarNavegacao();
    inicializarListeners();
});

// ========== NAVEGAÇÃO ==========
function inicializarNavegacao() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById(`page-${page}`).classList.add('active');

            if (page === 'status') {
                mostrarLocaisStatus();
            }
        });
    });
}

// ========== LISTENERS FIREBASE ==========
function inicializarListeners() {
    // Setores
    onValue(ref(db, `catalogo/${CONDOMINIO_ID}/setores`), (snapshot) => {
        setoresData = snapshot.val() || {};
        renderSetores();
        atualizarSelectSetores();
    });

    // Locais
    onValue(ref(db, `catalogo/${CONDOMINIO_ID}/locais`), (snapshot) => {
        locaisData = snapshot.val() || {};
        renderLocais();
        renderLocaisStatus();
    });

    // Equipamentos
    onValue(ref(db, `catalogo/${CONDOMINIO_ID}/equipamentos`), (snapshot) => {
        equipamentosData = snapshot.val() || {};
        renderEquipamentos();
        atualizarSelectEquipamentos();
    });

    // Subequipamentos
    onValue(ref(db, `catalogo/${CONDOMINIO_ID}/subequipamentos`), (snapshot) => {
        subequipamentosData = snapshot.val() || {};
        renderSubequipamentos();
    });

    // Monitoramento
    onValue(ref(db, `monitoramento/${CONDOMINIO_ID}/stats/dispositivos`), (snapshot) => {
        monitoramentoData = snapshot.val() || {};
        renderDashboard();
        renderStatusEquipamentos();
        atualizarSidebarOffline();
    });

    // Chamados
    onValue(ref(db, `chamados/abertos`), (snapshot) => {
        chamadosData = snapshot.val() || {};
        renderDashboard();
        renderChamados();
    });

    // Histórico Offline (NOVO!)
    onValue(ref(db, `historico_offline/${CONDOMINIO_ID}`), (snapshot) => {
        historicoOfflineData = snapshot.val() || {};
        atualizarSidebarOffline();
    });
}

// ========== FUNÇÕES AUXILIARES ==========
function secondsNow() {
    return Math.floor(Date.now() / 1000);
}

function computeEffectiveOnline(dispositivo) {
    if (!dispositivo) return false;
    const agora = secondsNow();
    const lastUpdate = dispositivo.last_update || 0;
    const deltaSeconds = agora - lastUpdate;
    if (deltaSeconds > OFFLINE_SE_ULTIMO_UPDATE_MAIOR_QUE) return false;
    return dispositivo.status === 'online';
}

function computeColor(dispositivo, temChamado = false) {
    if (temChamado) return '#facc15';
    if (!dispositivo) return '#64748b';
    const online = computeEffectiveOnline(dispositivo);
    if (!online) return '#ef4444';
    const lat = dispositivo.lat || 0;
    if (lat > LIMIAR_MS) return '#facc15';
    return '#10b981';
}

function formatarTempo(segundos) {
    if (segundos < 60) return `${segundos}s`;
    if (segundos < 3600) return `${Math.floor(segundos / 60)}min`;
    if (segundos < 86400) return `${Math.floor(segundos / 3600)}h`;
    return `${Math.floor(segundos / 86400)}d`;
}

function formatarDataHora(timestamp) {
    const data = new Date(timestamp * 1000);
    return data.toLocaleString('pt-BR');
}

// ========== SIDEBAR OFFLINE (NOVA!) ==========
function atualizarSidebarOffline() {
    const agora = secondsNow();
    const equipamentosArray = Object.entries(equipamentosData);
    const totalEquipamentos = equipamentosArray.length;

    // Equipamentos offline agora
    const offlineAgora = equipamentosArray.filter(([id, equip]) => {
        const dispositivo = monitoramentoData[equip.nome];
        return !computeEffectiveOnline(dispositivo);
    });

    // Calcular impacto
    const percentualImpacto = totalEquipamentos > 0
        ? Math.round((offlineAgora.length / totalEquipamentos) * 100)
        : 0;

    // Atualizar impacto
    document.getElementById('impacto-percentual').textContent = `${percentualImpacto}%`;
    document.getElementById('impacto-barra-fill').style.width = `${percentualImpacto}%`;
    document.getElementById('impacto-detalhes').innerHTML = `
        ${offlineAgora.length} de ${totalEquipamentos} equipamentos indisponíveis
    `;

    // Renderizar offline agora
    const listaOfflineAgora = document.getElementById('lista-offline-agora');
    if (offlineAgora.length === 0) {
        listaOfflineAgora.innerHTML = '<div class="offline-vazio">✓ Todos os equipamentos online</div>';
    } else {
        listaOfflineAgora.innerHTML = offlineAgora.map(([id, equip]) => {
            const dispositivo = monitoramentoData[equip.nome];
            const lastUpdate = dispositivo?.last_update || 0;
            const tempoOffline = agora - lastUpdate;
            const local = locaisData[equip.localId];
            const setor = setoresData[local?.setorId];

            return `
                <div class="offline-item">
                    <div class="offline-item-nome">${equip.nome}</div>
                    <div class="offline-item-tempo">
                        <i class="fa-solid fa-clock"></i>
                        ${formatarTempo(tempoOffline)}
                    </div>
                    <div class="offline-item-local">
                        ${setor?.nome || 'N/A'} → ${local?.nome || 'N/A'}
                    </div>
                </div>
            `;
        }).join('');
    }

    // Histórico 24h
    const historico24h = Object.entries(historicoOfflineData)
        .filter(([id, evento]) => {
            const tempoDecorrido = agora - (evento.timestamp || 0);
            return tempoDecorrido <= 86400; // 24 horas
        })
        .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))
        .slice(0, 10);

    const listaHistorico24h = document.getElementById('lista-historico-24h');
    if (historico24h.length === 0) {
        listaHistorico24h.innerHTML = '<div class="offline-vazio">Nenhum evento nas últimas 24h</div>';
    } else {
        listaHistorico24h.innerHTML = historico24h.map(([id, evento]) => {
            const tempoDecorrido = agora - (evento.timestamp || 0);
            return `
                <div class="offline-item">
                    <div class="offline-item-nome">${evento.equipamento || 'N/A'}</div>
                    <div class="offline-item-tempo">
                        <i class="fa-solid fa-history"></i>
                        ${formatarTempo(tempoDecorrido)} atrás
                    </div>
                    <div class="offline-item-local">
                        Duração: ${formatarTempo(evento.duracao || 0)}
                    </div>
                </div>
            `;
        }).join('');
    }
}

// ========== DASHBOARD ==========
function renderDashboard() {
    const equipamentosArray = Object.entries(equipamentosData);
    let totalOnline = 0;
    let totalAlerta = 0;
    let totalOffline = 0;

    equipamentosArray.forEach(([id, equip]) => {
        const dispositivo = monitoramentoData[equip.nome];
        const temChamado = chamadosData[equip.nome];
        const online = computeEffectiveOnline(dispositivo);
        const lat = dispositivo?.lat || 0;

        if (temChamado) {
            totalAlerta++;
        } else if (!online) {
            totalOffline++;
        } else if (lat > LIMIAR_MS) {
            totalAlerta++;
        } else {
            totalOnline++;
        }
    });

    document.getElementById('dash-total').textContent = equipamentosArray.length;
    document.getElementById('dash-online').textContent = totalOnline;
    document.getElementById('dash-alerta').textContent = totalAlerta;
    document.getElementById('dash-offline').textContent = totalOffline;

    // Renderizar cards de equipamentos
    const container = document.getElementById('dashboard-equipamentos');
    if (equipamentosArray.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8;">Nenhum equipamento cadastrado.</p>';
        return;
    }

    container.innerHTML = equipamentosArray.map(([id, equip]) => {
        const dispositivo = monitoramentoData[equip.nome];
        const temChamado = chamadosData[equip.nome];
        const color = computeColor(dispositivo, temChamado);
        const online = computeEffectiveOnline(dispositivo);
        const lat = dispositivo?.lat || 0;
        const lastUpdate = dispositivo?.last_update || 0;
        const agora = secondsNow();
        const tempoOffline = agora - lastUpdate;

        const local = locaisData[equip.localId];
        const setor = setoresData[local?.setorId];

        let statusTexto = online ? 'Online' : 'Offline';
        if (temChamado) statusTexto = 'Chamado Aberto';

        return `
            <div class="card-dash-equip" style="border-left-color: ${color};">
                <div class="card-dash-header">
                    <div class="status-indicator" style="background: ${color};"></div>
                    <div>
                        <div class="card-dash-nome">${equip.nome}</div>
                        <div class="card-dash-local">${setor?.nome || 'N/A'} → ${local?.nome || 'N/A'}</div>
                    </div>
                </div>
                <div class="card-dash-info">
                    <div><i class="fa-solid fa-signal"></i> Status: ${statusTexto}</div>
                    <div><i class="fa-solid fa-network-wired"></i> IP: ${equip.ip || 'N/A'}</div>
                    <div><i class="fa-solid fa-clock"></i> Latência: ${lat}ms</div>
                    ${!online ? `<div><i class="fa-solid fa-exclamation-triangle"></i> Offline há ${formatarTempo(tempoOffline)}</div>` : ''}
                </div>
                ${temChamado ? `<div class="card-dash-chamado">⚠ Chamado #${temChamado.numero || 'N/A'} aberto</div>` : ''}
            </div>
        `;
    }).join('');
}

// ========== STATUS EQUIPAMENTOS ==========
function renderLocaisStatus() {
    const container = document.getElementById('status-locais');
    const locaisArray = Object.entries(locaisData);

    if (locaisArray.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8;">Nenhum local cadastrado.</p>';
        return;
    }

    container.innerHTML = locaisArray.map(([id, local]) => {
        const equipamentosDoLocal = Object.entries(equipamentosData).filter(([_, e]) => e.localId === id);
        const totalEquip = equipamentosDoLocal.length;
        let online = 0, alerta = 0, offline = 0;

        equipamentosDoLocal.forEach(([_, equip]) => {
            const dispositivo = monitoramentoData[equip.nome];
            const temChamado = chamadosData[equip.nome];
            const isOnline = computeEffectiveOnline(dispositivo);
            const lat = dispositivo?.lat || 0;

            if (temChamado) alerta++;
            else if (!isOnline) offline++;
            else if (lat > LIMIAR_MS) alerta++;
            else online++;
        });

        let color = '#10b981';
        if (offline > 0) color = '#ef4444';
        else if (alerta > 0) color = '#facc15';

        const setor = setoresData[local.setorId];

        return `
            <div class="card-status-local" style="border-left-color: ${color};" onclick="mostrarEquipamentosDoLocal('${id}')">
                <div class="status-indicator" style="background: ${color};"></div>
                <div style="flex: 1;">
                    <div class="card-status-nome">${local.nome}</div>
                    <div class="card-status-setor">${setor?.nome || 'N/A'}</div>
                    <div class="card-status-info">
                        <span style="color: #10b981;">✓ ${online}</span> | 
                        <span style="color: #facc15;">⚠ ${alerta}</span> | 
                        <span style="color: #ef4444;">✗ ${offline}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function mostrarLocaisStatus() {
    localSelecionadoStatus = null;
    document.getElementById('status-locais').style.display = 'grid';
    document.getElementById('status-equipamentos').style.display = 'none';
}

window.mostrarEquipamentosDoLocal = function (localId) {
    localSelecionadoStatus = localId;
    document.getElementById('status-locais').style.display = 'none';
    document.getElementById('status-equipamentos').style.display = 'block';
    renderStatusEquipamentos();
};

function renderStatusEquipamentos() {
    if (!localSelecionadoStatus) return;

    const container = document.getElementById('status-equipamentos');
    const local = locaisData[localSelecionadoStatus];
    const setor = setoresData[local?.setorId];

    const equipamentosDoLocal = Object.entries(equipamentosData).filter(([_, e]) => e.localId === localSelecionadoStatus);

    let html = `
        <div class="status-equipamentos-header">
            <button class="btn-voltar" onclick="mostrarLocaisStatus()">
                <i class="fa-solid fa-arrow-left"></i> Voltar
            </button>
            <div>
                <h3 style="color: #e2e8f0; margin: 0;">${local?.nome || 'N/A'}</h3>
                <p style="color: #94a3b8; font-size: 13px; margin: 5px 0 0 0;">${setor?.nome || 'N/A'}</p>
            </div>
        </div>
        <div class="grid-status-equipamentos">
    `;

    if (equipamentosDoLocal.length === 0) {
        html += '<p style="color: #94a3b8;">Nenhum equipamento neste local.</p>';
    } else {
        equipamentosDoLocal.forEach(([id, equip]) => {
            const dispositivo = monitoramentoData[equip.nome];
            const temChamado = chamadosData[equip.nome];
            const color = computeColor(dispositivo, temChamado);
            const online = computeEffectiveOnline(dispositivo);
            const lat = dispositivo?.lat || 0;
            const lastUpdate = dispositivo?.last_update || 0;
            const agora = secondsNow();
            const tempoOffline = agora - lastUpdate;

            let statusTexto = online ? 'Online' : 'Offline';
            if (temChamado) statusTexto = 'Chamado Aberto';

            html += `
                <div class="card-status-equip" style="border-left-color: ${color};">
                    <div class="card-status-equip-header">
                        <div class="status-indicator" style="background: ${color};"></div>
                        <div class="card-status-equip-nome">${equip.nome}</div>
                    </div>
                    <div class="card-status-equip-info">
                        <div><i class="fa-solid fa-signal"></i> Status: ${statusTexto}</div>
                        <div><i class="fa-solid fa-network-wired"></i> IP: ${equip.ip || 'N/A'}</div>
                        <div><i class="fa-solid fa-plug"></i> Porta: ${equip.porta || 'N/A'}</div>
                        <div><i class="fa-solid fa-clock"></i> Latência: ${lat}ms</div>
                        ${!online ? `<div><i class="fa-solid fa-exclamation-triangle"></i> Offline há ${formatarTempo(tempoOffline)}</div>` : ''}
                        <div><i class="fa-solid fa-calendar"></i> Última atualização: ${formatarDataHora(lastUpdate)}</div>
                    </div>
                    <button class="btn-grafico" onclick="abrirGrafico('${equip.nome}')">
                        <i class="fa-solid fa-chart-line"></i> Ver Histórico
                    </button>
                </div>
            `;
        });
    }

    html += '</div>';
    container.innerHTML = html;
}

// ========== GRÁFICO (PLACEHOLDER - IMPLEMENTAR CHART.JS) ==========
window.abrirGrafico = function (nomeEquipamento) {
    equipamentoGraficoAtual = nomeEquipamento;
    document.getElementById('modal-grafico-title').textContent = `Histórico: ${nomeEquipamento}`;
    document.getElementById('modal-grafico').style.display = 'flex';
    carregarDadosGrafico();
};

window.mudarPeriodo = function (periodo) {
    periodoGraficoAtual = periodo;
    document.querySelectorAll('.btn-periodo').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    carregarDadosGrafico();
};

function carregarDadosGrafico() {
    // IMPLEMENTAR: Buscar dados históricos do Firebase e renderizar com Chart.js
    const statsContainer = document.getElementById('grafico-stats');
    statsContainer.innerHTML = `
        <div class="stat-item">
            <div class="stat-label">Uptime</div>
            <div class="stat-valor">98.5%</div>
        </div>
        <div class="stat-item">
            <div class="stat-label">Latência Média</div>
            <div class="stat-valor">45ms</div>
        </div>
        <div class="stat-item">
            <div class="stat-label">Pico</div>
            <div class="stat-valor">320ms</div>
        </div>
        <div class="stat-item">
            <div class="stat-label">Quedas</div>
            <div class="stat-valor">2</div>
        </div>
    `;

    // Placeholder para o gráfico
    const canvas = document.getElementById('grafico-canvas');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Gráfico em desenvolvimento (integrar Chart.js)', canvas.width / 2, canvas.height / 2);
}

// ========== SETORES ==========
function renderSetores() {
    const container = document.getElementById('lista-setores');
    const setoresArray = Object.entries(setoresData);

    if (setoresArray.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8;">Nenhum setor cadastrado.</p>';
        return;
    }

    container.innerHTML = setoresArray.map(([id, setor]) => `
        <div class="item-lista">
            <div class="item-info">
                <i class="fa-solid fa-building"></i>
                <div>
                    <div>${setor.nome}</div>
                </div>
            </div>
            <div class="item-actions">
                <button class="btn-icon" onclick="editarSetor('${id}')">
                    <i class="fa-solid fa-edit"></i>
                </button>
                <button class="btn-icon btn-delete" onclick="excluirSetor('${id}')">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

window.abrirModalSetor = function () {
    editandoId = null;
    editandoTipo = 'setor';
    document.getElementById('modal-setor-title').textContent = 'Novo Setor';
    document.getElementById('input-setor-nome').value = '';
    document.getElementById('modal-setor').style.display = 'flex';
};

window.editarSetor = function (id) {
    editandoId = id;
    editandoTipo = 'setor';
    const setor = setoresData[id];
    document.getElementById('modal-setor-title').textContent = 'Editar Setor';
    document.getElementById('input-setor-nome').value = setor.nome;
    document.getElementById('modal-setor').style.display = 'flex';
};

window.salvarSetor = async function () {
    const nome = document.getElementById('input-setor-nome').value.trim();
    if (!nome) {
        alert('Preencha o nome do setor');
        return;
    }

    const id = editandoId || push(ref(db, `catalogo/${CONDOMINIO_ID}/setores`)).key;
    await set(ref(db, `catalogo/${CONDOMINIO_ID}/setores/${id}`), { nome });
    fecharModal('modal-setor');
};

window.excluirSetor = async function (id) {
    if (!confirm('Deseja realmente excluir este setor?')) return;
    await remove(ref(db, `catalogo/${CONDOMINIO_ID}/setores/${id}`));
};

// ========== LOCAIS ==========
function renderLocais() {
    const container = document.getElementById('lista-locais');
    const locaisArray = Object.entries(locaisData);

    if (locaisArray.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8;">Nenhum local cadastrado.</p>';
        return;
    }

    container.innerHTML = locaisArray.map(([id, local]) => {
        const setor = setoresData[local.setorId];
        return `
            <div class="item-lista">
                <div class="item-info">
                    <i class="fa-solid fa-map-marker-alt"></i>
                    <div>
                        <div>${local.nome}</div>
                        <div class="item-subtitle">${setor?.nome || 'Setor não encontrado'}</div>
                    </div>
                </div>
                <div class="item-actions">
                    <button class="btn-icon" onclick="editarLocal('${id}')">
                        <i class="fa-solid fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" onclick="excluirLocal('${id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.abrirModalLocal = function () {
    editandoId = null;
    editandoTipo = 'local';
    document.getElementById('modal-local-title').textContent = 'Novo Local';
    document.getElementById('input-local-nome').value = '';
    document.getElementById('input-local-setor').value = '';
    document.getElementById('modal-local').style.display = 'flex';
};

window.editarLocal = function (id) {
    editandoId = id;
    editandoTipo = 'local';
    const local = locaisData[id];
    document.getElementById('modal-local-title').textContent = 'Editar Local';
    document.getElementById('input-local-nome').value = local.nome;
    document.getElementById('input-local-setor').value = local.setorId;
    document.getElementById('modal-local').style.display = 'flex';
};

window.salvarLocal = async function () {
    const nome = document.getElementById('input-local-nome').value.trim();
    const setorId = document.getElementById('input-local-setor').value;

    if (!nome || !setorId) {
        alert('Preencha todos os campos');
        return;
    }

    const id = editandoId || push(ref(db, `catalogo/${CONDOMINIO_ID}/locais`)).key;
    await set(ref(db, `catalogo/${CONDOMINIO_ID}/locais/${id}`), { nome, setorId });
    fecharModal('modal-local');
};

window.excluirLocal = async function (id) {
    if (!confirm('Deseja realmente excluir este local?')) return;
    await remove(ref(db, `catalogo/${CONDOMINIO_ID}/locais/${id}`));
};

// ========== EQUIPAMENTOS ==========
function renderEquipamentos() {
    const container = document.getElementById('lista-equipamentos');
    const equipamentosArray = Object.entries(equipamentosData);

    if (equipamentosArray.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8;">Nenhum equipamento cadastrado.</p>';
        return;
    }

    container.innerHTML = equipamentosArray.map(([id, equip]) => {
        const local = locaisData[equip.localId];
        const setor = setoresData[local?.setorId];
        return `
            <div class="item-lista">
                <div class="item-info">
                    <i class="fa-solid fa-server"></i>
                    <div>
                        <div>${equip.nome}</div>
                        <div class="item-subtitle">${setor?.nome || 'N/A'} → ${local?.nome || 'N/A'} | IP: ${equip.ip || 'N/A'}</div>
                    </div>
                </div>
                <div class="item-actions">
                    <button class="btn-icon" onclick="editarEquipamento('${id}')">
                        <i class="fa-solid fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" onclick="excluirEquipamento('${id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.abrirModalEquipamento = function () {
    editandoId = null;
    editandoTipo = 'equipamento';
    document.getElementById('modal-equipamento-title').textContent = 'Novo Equipamento';
    document.getElementById('input-equipamento-nome').value = '';
    document.getElementById('input-equipamento-setor').value = '';
    document.getElementById('input-equipamento-local').value = '';
    document.getElementById('input-equipamento-ip').value = '';
    document.getElementById('input-equipamento-porta').value = '';
    document.getElementById('modal-equipamento').style.display = 'flex';
};

window.editarEquipamento = function (id) {
    editandoId = id;
    editandoTipo = 'equipamento';
    const equip = equipamentosData[id];
    const local = locaisData[equip.localId];
    document.getElementById('modal-equipamento-title').textContent = 'Editar Equipamento';
    document.getElementById('input-equipamento-nome').value = equip.nome;
    document.getElementById('input-equipamento-setor').value = local?.setorId || '';
    filtrarLocaisPorSetor();
    document.getElementById('input-equipamento-local').value = equip.localId;
    document.getElementById('input-equipamento-ip').value = equip.ip || '';
    document.getElementById('input-equipamento-porta').value = equip.porta || '';
    document.getElementById('modal-equipamento').style.display = 'flex';
};

window.salvarEquipamento = async function () {
    const nome = document.getElementById('input-equipamento-nome').value.trim();
    const localId = document.getElementById('input-equipamento-local').value;
    const ip = document.getElementById('input-equipamento-ip').value.trim();
    const porta = document.getElementById('input-equipamento-porta').value.trim();

    if (!nome || !localId || !ip || !porta) {
        alert('Preencha todos os campos');
        return;
    }

    const id = editandoId || push(ref(db, `catalogo/${CONDOMINIO_ID}/equipamentos`)).key;
    await set(ref(db, `catalogo/${CONDOMINIO_ID}/equipamentos/${id}`), { nome, localId, ip, porta });

    // Criar entrada no monitoramento
    await set(ref(db, `monitoramento/${CONDOMINIO_ID}/stats/dispositivos/${nome}`), {
        ip,
        porta,
        status: 'offline',
        lat: 0,
        last_update: secondsNow(),
        status_portas: {}
    });

    fecharModal('modal-equipamento');
};

window.excluirEquipamento = async function (id) {
    if (!confirm('Deseja realmente excluir este equipamento?')) return;
    const equip = equipamentosData[id];
    await remove(ref(db, `catalogo/${CONDOMINIO_ID}/equipamentos/${id}`));
    await remove(ref(db, `monitoramento/${CONDOMINIO_ID}/stats/dispositivos/${equip.nome}`));
};

window.filtrarLocaisPorSetor = function () {
    const setorId = document.getElementById('input-equipamento-setor').value;
    const selectLocal = document.getElementById('input-equipamento-local');
    selectLocal.innerHTML = '<option value="">Selecione um local</option>';

    if (!setorId) return;

    Object.entries(locaisData).forEach(([id, local]) => {
        if (local.setorId === setorId) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = local.nome;
            selectLocal.appendChild(option);
        }
    });
};

// ========== SUBEQUIPAMENTOS ==========
function renderSubequipamentos() {
    const container = document.getElementById('lista-subequipamentos');
    const subequipamentosArray = Object.entries(subequipamentosData);

    if (subequipamentosArray.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8;">Nenhum subequipamento cadastrado.</p>';
        return;
    }

    container.innerHTML = subequipamentosArray.map(([id, sub]) => {
        const equip = equipamentosData[sub.equipamentoId];
        const local = locaisData[equip?.localId];
        const setor = setoresData[local?.setorId];
        return `
            <div class="item-lista">
                <div class="item-info">
                    <i class="fa-solid fa-cogs"></i>
                    <div>
                        <div>${sub.nome}</div>
                        <div class="item-subtitle">${setor?.nome || 'N/A'} → ${local?.nome || 'N/A'} → ${equip?.nome || 'N/A'}</div>
                    </div>
                </div>
                <div class="item-actions">
                    <button class="btn-icon" onclick="editarSubequipamento('${id}')">
                        <i class="fa-solid fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" onclick="excluirSubequipamento('${id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.abrirModalSubequipamento = function () {
    editandoId = null;
    editandoTipo = 'subequipamento';
    document.getElementById('modal-subequipamento-title').textContent = 'Novo Subequipamento';
    document.getElementById('input-subequipamento-nome').value = '';
    document.getElementById('input-subequipamento-setor').value = '';
    document.getElementById('input-subequipamento-local').value = '';
    document.getElementById('input-subequipamento-equipamento').value = '';
    document.getElementById('modal-subequipamento').style.display = 'flex';
};

window.editarSubequipamento = function (id) {
    editandoId = id;
    editandoTipo = 'subequipamento';
    const sub = subequipamentosData[id];
    const equip = equipamentosData[sub.equipamentoId];
    const local = locaisData[equip?.localId];
    document.getElementById('modal-subequipamento-title').textContent = 'Editar Subequipamento';
    document.getElementById('input-subequipamento-nome').value = sub.nome;
    document.getElementById('input-subequipamento-setor').value = local?.setorId || '';
    filtrarLocaisPorSetorSub();
    document.getElementById('input-subequipamento-local').value = equip?.localId || '';
    filtrarEquipamentosPorLocal();
    document.getElementById('input-subequipamento-equipamento').value = sub.equipamentoId;
    document.getElementById('modal-subequipamento').style.display = 'flex';
};

window.salvarSubequipamento = async function () {
    const nome = document.getElementById('input-subequipamento-nome').value.trim();
    const equipamentoId = document.getElementById('input-subequipamento-equipamento').value;

    if (!nome || !equipamentoId) {
        alert('Preencha todos os campos');
        return;
    }

    const id = editandoId || push(ref(db, `catalogo/${CONDOMINIO_ID}/subequipamentos`)).key;
    await set(ref(db, `catalogo/${CONDOMINIO_ID}/subequipamentos/${id}`), { nome, equipamentoId });
    fecharModal('modal-subequipamento');
};

window.excluirSubequipamento = async function (id) {
    if (!confirm('Deseja realmente excluir este subequipamento?')) return;
    await remove(ref(db, `catalogo/${CONDOMINIO_ID}/subequipamentos/${id}`));
};

window.filtrarLocaisPorSetorSub = function () {
    const setorId = document.getElementById('input-subequipamento-setor').value;
    const selectLocal = document.getElementById('input-subequipamento-local');
    selectLocal.innerHTML = '<option value="">Selecione um local</option>';

    if (!setorId) return;

    Object.entries(locaisData).forEach(([id, local]) => {
        if (local.setorId === setorId) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = local.nome;
            selectLocal.appendChild(option);
        }
    });
};

window.filtrarEquipamentosPorLocal = function () {
    const localId = document.getElementById('input-subequipamento-local').value;
    const selectEquip = document.getElementById('input-subequipamento-equipamento');
    selectEquip.innerHTML = '<option value="">Selecione um equipamento</option>';

    if (!localId) return;

    Object.entries(equipamentosData).forEach(([id, equip]) => {
        if (equip.localId === localId) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = equip.nome;
            selectEquip.appendChild(option);
        }
    });
};

// ========== CHAMADOS ==========
function renderChamados() {
    const container = document.getElementById('lista-chamados');
    const chamadosArray = Object.entries(chamadosData);

    if (chamadosArray.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8;">Nenhum chamado aberto.</p>';
        return;
    }

    container.innerHTML = chamadosArray.map(([nomeEquip, chamado]) => {
        return `
            <div class="card-chamado">
                <div class="chamado-header">
                    <div class="chamado-numero">#${chamado.numero || 'N/A'}</div>
                    <div class="chamado-data">${formatarDataHora(chamado.timestamp || 0)}</div>
                </div>
                <div class="chamado-info">
                    <div><i class="fa-solid fa-server"></i> Equipamento: ${nomeEquip}</div>
                    <div><i class="fa-solid fa-user"></i> Aberto por: ${chamado.abertoPor || 'Sistema'}</div>
                    <div><i class="fa-solid fa-comment"></i> Observação: ${chamado.observacao || 'N/A'}</div>
                </div>
                <button class="btn-fechar-chamado" onclick="fecharChamado('${nomeEquip}')">
                    <i class="fa-solid fa-check"></i> Fechar Chamado
                </button>
            </div>
        `;
    }).join('');
}

window.fecharChamado = async function (nomeEquip) {
    if (!confirm('Deseja realmente fechar este chamado?')) return;

    const chamado = chamadosData[nomeEquip];
    const agora = secondsNow();

    // Mover para histórico
    await push(ref(db, `chamados/historico`), {
        ...chamado,
        equipamento: nomeEquip,
        fechadoEm: agora,
        duracao: agora - (chamado.timestamp || 0)
    });

    // Remover de abertos
    await remove(ref(db, `chamados/abertos/${nomeEquip}`));
};

// ========== ATUALIZAR SELECTS ==========
function atualizarSelectSetores() {
    const selects = [
        document.getElementById('input-local-setor'),
        document.getElementById('input-equipamento-setor'),
        document.getElementById('input-subequipamento-setor')
    ];

    selects.forEach(select => {
        if (!select) return;
        const valorAtual = select.value;
        select.innerHTML = '<option value="">Selecione um setor</option>';
        Object.entries(setoresData).forEach(([id, setor]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = setor.nome;
            select.appendChild(option);
        });
        select.value = valorAtual;
    });
}

function atualizarSelectEquipamentos() {
    // Implementar se necessário
}

// ========== FECHAR MODAL ==========
window.fecharModal = function (modalId) {
    document.getElementById(modalId).style.display = 'none';
    editandoId = null;
    editandoTipo = null;
};

// Fechar modal ao clicar fora
window.onclick = function (event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};