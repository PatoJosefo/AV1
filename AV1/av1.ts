import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import * as path from 'path';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR);

enum TipoAeronave { COMERCIAL = 'COMERCIAL', MILITAR = 'MILITAR' }
enum TipoPeca { NACIONAL = 'NACIONAL', IMPORTADA = 'IMPORTADA' }
enum StatusPeca { EM_PRODUCAO = 'EM_PRODUCAO', EM_TRANSPORTE = 'EM_TRANSPORTE', PRONTA = 'PRONTA' }
enum StatusEtapa { PENDENTE = 'PENDENTE', ANDAMENTO = 'ANDAMENTO', CONCLUIDA = 'CONCLUIDA' }
enum NivelPermissao { ADMINISTRADOR = 'ADMINISTRADOR', ENGENHEIRO = 'ENGENHEIRO', OPERADOR = 'OPERADOR' }
enum TipoTeste { ELETRICO = 'ELETRICO', HIDRAULICO = 'HIDRAULICO', AERODINAMICO = 'AERODINAMICO' }
enum ResultadoTeste { APROVADO = 'APROVADO', REPROVADO = 'REPROVADO' }

type ID = string;

function saveJSON(filename: string, obj: any) {
  writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(obj, null, 2), 'utf-8');
}
function loadJSON<T>(filename: string, fallback: T): T {
  const p = path.join(DATA_DIR, filename);
  if (!existsSync(p)) return fallback;
  try { return JSON.parse(readFileSync(p, 'utf-8')) as T; } catch { return fallback; }
}
function nowISO() { return new Date().toISOString(); }

class Peca {
  constructor(
    public id: ID,
    public nome: string,
    public tipo: TipoPeca,
    public fornecedor: string,
    public status: StatusPeca = StatusPeca.EM_PRODUCAO
  ){}
}

class Teste {
  constructor(
    public id: ID,
    public tipo: TipoTeste,
    public resultado: ResultadoTeste | null = null
  ){}
}

class Funcionario {
  constructor(
    public id: ID,
    public nome: string,
    public telefone: string,
    public endereco: string,
    public usuario: string,
    public senha: string,
    public nivel: NivelPermissao
  ){}
}

class Etapa {
  public funcionarios: ID[] = [];
  constructor(
    public id: ID,
    public nome: string,
    public prazo: string, 
    public status: StatusEtapa = StatusEtapa.PENDENTE
  ){}
  addFuncionario(id: ID){ if(!this.funcionarios.includes(id)) this.funcionarios.push(id); }
}

class Aeronave {
  public pecas: Peca[] = [];
  public etapas: Etapa[] = [];
  public testes: Teste[] = [];
  public cliente: string | null = null;
  public dataEntrega: string | null = null;

  constructor(
    public codigo: string,
    public modelo: string,
    public tipo: TipoAeronave,
    public capacidade: number,
    public alcance: number
  ){}

  detalhes(){
    return {
      codigo: this.codigo,
      modelo: this.modelo,
      tipo: this.tipo,
      capacidade: this.capacidade,
      alcance: this.alcance,
      pecas: this.pecas.map(p=>({id:p.id,nome:p.nome,status:p.status})),
      etapas: this.etapas.map(e=>({id:e.id,nome:e.nome,status:e.status})),
      testes: this.testes.map(t=>({id:t.id,tipo:t.tipo,resultado:t.resultado}))
    }
  }
}

class Repo {
  aeronaves: Aeronave[] = loadJSON<Aeronave[]>('aeronaves.json', []);
  funcionarios: Funcionario[] = loadJSON<Funcionario[]>('funcionarios.json', []);

  persist(){
    saveJSON('aeronaves.json', this.aeronaves);
    saveJSON('funcionarios.json', this.funcionarios);
  }
}

const repo = new Repo();

let currentUser: Funcionario | null = null;
function requireAuth(levels: NivelPermissao[]){
  if(!currentUser) throw new Error('Autenticação necessária');
  if(!levels.includes(currentUser.nivel)) throw new Error('Permissão negada');
}
function genId(prefix = ''){ return prefix + Math.random().toString(36).slice(2,9); }

const rl = readline.createInterface({ input, output });

async function pause(){ await rl.question('Pressione ENTER para continuar...'); }

async function cmd_createFuncionario(){
  console.log('\n== Criar Funcionário ==');
  const nome = await rl.question('Nome: ');
  const telefone = await rl.question('Telefone: ');
  const endereco = await rl.question('Endereço: ');
  const usuario = await rl.question('Usuário (login): ');
  const senha = await rl.question('Senha: ');
  const nivelRaw = await rl.question('Nível (ADMINISTRADOR, ENGENHEIRO, OPERADOR): ');
  const nivel = (nivelRaw.toUpperCase() in NivelPermissao) ? (nivelRaw.toUpperCase() as NivelPermissao) : NivelPermissao.OPERADOR;
  const f = new Funcionario(genId('F-'), nome, telefone, endereco, usuario, senha, nivel as NivelPermissao);
  repo.funcionarios.push(f); repo.persist();
  console.log('Funcionário criado:', f.id);
  
}

async function cmd_deleteFuncionario() {
  requireAuth([NivelPermissao.ADMINISTRADOR]); 
  console.log("\n== Deletar Funcionário ==");

  const fid = await rl.question("ID do funcionário: ");
  const index = repo.funcionarios.findIndex(f => f.id === fid);

  if (index < 0) {
    console.log("Funcionário não encontrado");
    return;
  }

  repo.funcionarios.splice(index, 1);
  repo.persist();
  console.log("Funcionário deletado com sucesso!");
}


async function cmd_login(){
  const usuario = await rl.question('Usuário: ');
  const senha = await rl.question('Senha: ');
  const f = repo.funcionarios.find(x=>x.usuario===usuario && x.senha===senha);
  if(!f){ console.log('Login falhou'); return; }
  currentUser = f; console.log('Logado como', f.nome, f.nivel);
}

async function cmd_logout(){ currentUser = null; console.log('Deslogado'); }

async function cmd_createAeronave(){
  requireAuth([NivelPermissao.ADMINISTRADOR, NivelPermissao.ENGENHEIRO]);
  console.log('\n== Criar Aeronave ==');
  const codigo = await rl.question('Código (único): ');
  if(repo.aeronaves.find(a=>a.codigo===codigo)){ console.log('Código já existe'); return; }
  const modelo = await rl.question('Modelo: ');
  const tipoRaw = await rl.question('Tipo (COMERCIAL/MILITAR): ');
  const tipo = (tipoRaw.toUpperCase() in TipoAeronave) ? (tipoRaw.toUpperCase() as TipoAeronave) : TipoAeronave.COMERCIAL;
  const capacidade = Number(await rl.question('Capacidade (nro passageiros): '));
  const alcance = Number(await rl.question('Alcance (km): '));
  const a = new Aeronave(codigo, modelo, tipo as TipoAeronave, capacidade, alcance);
  repo.aeronaves.push(a); repo.persist();
  console.log('Aeronave criada', codigo);

}

  async function cmd_deleteAeronave() {
  requireAuth([NivelPermissao.ADMINISTRADOR, NivelPermissao.ENGENHEIRO]);
  console.log("\n== Deletar Aeronave ==");

  const codigo = await rl.question("Código da aeronave: ");
  const index = repo.aeronaves.findIndex(a => a.codigo === codigo);

  if (index < 0) {
    console.log("Aeronave não encontrada");
    return;
  }

  repo.aeronaves.splice(index, 1);
  repo.persist();
  console.log("Aeronave deletada com sucesso!");
}


async function cmd_listAeronaves(){
  console.log('\n== Lista de Aeronaves ==');
  repo.aeronaves.forEach(a=>{
    console.log(`${a.codigo} - ${a.modelo} (${a.tipo}) - Pecas:${a.pecas.length} Etapas:${a.etapas.length} Testes:${a.testes.length}`);
  });
}

async function cmd_showAeronave(){
  const codigo = await rl.question('Código da aeronave: ');
  const a = repo.aeronaves.find(x=>x.codigo===codigo);
  if(!a){ console.log('Não encontrada'); return; }
  console.log(JSON.stringify(a.detalhes(), null, 2));
}

async function cmd_addPeca(){
  requireAuth([NivelPermissao.ADMINISTRADOR, NivelPermissao.ENGENHEIRO]);
  const codigo = await rl.question('Código aeronave: ');
  const a = repo.aeronaves.find(x=>x.codigo===codigo); if(!a){ console.log('Aeronave não encontrada'); return; }
  const nome = await rl.question('Nome da peça: ');
  const tipoRaw = await rl.question('Tipo (NACIONAL/IMPORTADA): ');
  const tipo = (tipoRaw.toUpperCase() in TipoPeca) ? (tipoRaw.toUpperCase() as TipoPeca) : TipoPeca.NACIONAL;
  const fornecedor = await rl.question('Fornecedor: ');
  const p = new Peca(genId('P-'), nome, tipo as TipoPeca, fornecedor);
  a.pecas.push(p); repo.persist(); console.log('Peça adicionada', p.id);
}

async function cmd_addEtapa(){
  requireAuth([NivelPermissao.ADMINISTRADOR, NivelPermissao.ENGENHEIRO]);
  const codigo = await rl.question('Código aeronave: ');
  const a = repo.aeronaves.find(x=>x.codigo===codigo); if(!a){ console.log('Aeronave não encontrada'); return; }
  const nome = await rl.question('Nome da etapa: ');
  const prazo = await rl.question('Prazo (ISO date ou texto): ');
  const e = new Etapa(genId('E-'), nome, prazo);
  a.etapas.push(e); repo.persist(); console.log('Etapa adicionada', e.id);
}

async function cmd_startEtapa(){
  requireAuth([NivelPermissao.ADMINISTRADOR, NivelPermissao.ENGENHEIRO, NivelPermissao.OPERADOR]);
  const codigo = await rl.question('Código aeronave: ');
  const eid = await rl.question('ID etapa: ');
  const a = repo.aeronaves.find(x=>x.codigo===codigo); if(!a){ console.log('Aeronave não encontrada'); return; }
const idx = a.etapas.findIndex(x => x.id === eid);
if (idx < 0) {
  console.log('Etapa não encontrada');
  return;
}

const etapa = a.etapas[idx];
if (!etapa) {
  console.log('Etapa não encontrada');
  return;
}

if (idx > 0 && a.etapas[idx - 1]?.status !== StatusEtapa.CONCLUIDA) {
  console.log('Não pode iniciar: etapa anterior não concluída');
  return;
}

etapa.status = StatusEtapa.ANDAMENTO;
repo.persist();
console.log('Etapa iniciada');
}

async function cmd_finishEtapa(){
  requireAuth([NivelPermissao.ADMINISTRADOR, NivelPermissao.ENGENHEIRO]);
  const codigo = await rl.question('Código aeronave: ');
  const eid = await rl.question('ID etapa: ');
  const a = repo.aeronaves.find(x=>x.codigo===codigo); if(!a){ console.log('Aeronave não encontrada'); return; }
  const idx = a.etapas.findIndex(x => x.id === eid);
    if (idx < 0) {
    console.log('Etapa não encontrada');
    return;
  }

  const etapa = a.etapas[idx];
  if (!etapa) {
    console.log('Etapa não encontrada');
    return;
  }

  if (etapa.status !== StatusEtapa.ANDAMENTO) {
    console.log('Etapa não está em andamento');
    return;
  }

etapa.status = StatusEtapa.CONCLUIDA;
repo.persist();
console.log('Etapa finalizada');
}

async function cmd_assignFuncionario(){
  requireAuth([NivelPermissao.ADMINISTRADOR, NivelPermissao.ENGENHEIRO]);
  const codigo = await rl.question('Código aeronave: ');
  const eid = await rl.question('ID etapa: ');
  const fid = await rl.question('ID funcionário: ');
  const a = repo.aeronaves.find(x=>x.codigo===codigo); if(!a){ console.log('Aeronave não encontrada'); return; }
  const e = a.etapas.find(x=>x.id===eid); if(!e){ console.log('Etapa não encontrada'); return; }
  const f = repo.funcionarios.find(x=>x.id===fid); if(!f){ console.log('Funcionário não encontrado'); return; }
  e.addFuncionario(fid); repo.persist(); console.log('Funcionário associado');
}

async function cmd_addTeste(){
  requireAuth([NivelPermissao.ADMINISTRADOR, NivelPermissao.ENGENHEIRO]);
  const codigo = await rl.question('Código aeronave: ');
  const a = repo.aeronaves.find(x=>x.codigo===codigo); if(!a){ console.log('Aeronave não encontrada'); return; }
  const tipoRaw = await rl.question('Tipo de teste (ELETRICO/HIDRAULICO/AERODINAMICO): ');
  const tipo = (tipoRaw.toUpperCase() in TipoTeste) ? (tipoRaw.toUpperCase() as TipoTeste) : TipoTeste.ELETRICO;
  const t = new Teste(genId('T-'), tipo as TipoTeste);
  a.testes.push(t); repo.persist(); console.log('Teste criado', t.id);
}

async function cmd_setResultadoTeste(){
  requireAuth([NivelPermissao.ADMINISTRADOR, NivelPermissao.ENGENHEIRO]);
  const codigo = await rl.question('Código aeronave: ');
  const tid = await rl.question('ID teste: ');
  const resRaw = await rl.question('Resultado (APROVADO/REPROVADO): ');
  const a = repo.aeronaves.find(x=>x.codigo===codigo); if(!a){ console.log('Aeronave não encontrada'); return; }
  const t = a.testes.find(x=>x.id===tid); if(!t){ console.log('Teste não encontrado'); return; }
  t.resultado = (resRaw.toUpperCase() === 'APROVADO') ? ResultadoTeste.APROVADO : ResultadoTeste.REPROVADO; repo.persist(); console.log('Resultado setado');
}

async function cmd_generateReport(){
  requireAuth([NivelPermissao.ADMINISTRADOR, NivelPermissao.ENGENHEIRO]);
  const codigo = await rl.question('Código aeronave: ');
  const cliente = await rl.question('Nome do cliente: ');
  const dataEntrega = await rl.question('Data de entrega (ISO): ');
  const a = repo.aeronaves.find(x=>x.codigo===codigo); if(!a){ console.log('Aeronave não encontrada'); return; }
  a.cliente = cliente; a.dataEntrega = dataEntrega;

  const lines: string[] = [];
  lines.push(`Relatório Aeronave - ${a.codigo}`);
  lines.push(`Modelo: ${a.modelo}`);
  lines.push(`Tipo: ${a.tipo}`);
  lines.push(`Capacidade: ${a.capacidade}`);
  lines.push(`Alcance: ${a.alcance}`);
  lines.push('');
  lines.push('Peças:');
  a.pecas.forEach(p=> lines.push(`- ${p.id} | ${p.nome} | ${p.tipo} | ${p.fornecedor} | ${p.status}`));
  lines.push('');
  lines.push('Etapas:');
  a.etapas.forEach(e=> lines.push(`- ${e.id} | ${e.nome} | ${e.prazo} | ${e.status} | Funcionarios: ${e.funcionarios.join(',')}`));
  lines.push('');
  lines.push('Testes:');
  a.testes.forEach(t=> lines.push(`- ${t.id} | ${t.tipo} | Resultado: ${t.resultado}`));
  lines.push('');
  lines.push(`Cliente: ${a.cliente}`);
  lines.push(`Data de entrega: ${a.dataEntrega}`);
  lines.push(`Gerado em: ${nowISO()}`);

  const filename = path.join(DATA_DIR, `${a.codigo}_relatorio.txt`);
  writeFileSync(filename, lines.join('\n'), 'utf-8');
  repo.persist();
  console.log('Relatório gerado em', filename);
}

async function cmd_help(){
  console.log('\nComandos:');
  console.log('ajuda, sair, createFuncionario, login, logout, createAeronave, listAeronaves, showAeronave, addPeca, addEtapa, startEtapa, finishEtapa, assignFuncionario, addTeste, setResultadoTeste, generateReport, deleteFuncionario, deleteAeronave');
}

async function mainLoop(){
  console.log('=== Aerocode CLI - Starter ===');
  await cmd_help();
  while(true){
    try{
      const cmd = (await rl.question('\n> ')).trim();
      if(!cmd) continue;
      if(cmd==='sair') break;
      switch(cmd){
        case 'deleteFuncionario': await cmd_deleteFuncionario(); break;
        case 'deleteAeronave': await cmd_deleteAeronave(); break;
        case 'ajuda': await cmd_help(); break;
        case 'createFuncionario': await cmd_createFuncionario(); break;
        case 'login': await cmd_login(); break;
        case 'logout': await cmd_logout(); break;
        case 'createAeronave': await cmd_createAeronave(); break;
        case 'listAeronaves': await cmd_listAeronaves(); break;
        case 'showAeronave': await cmd_showAeronave(); break;
        case 'addPeca': await cmd_addPeca(); break;
        case 'addEtapa': await cmd_addEtapa(); break;
        case 'startEtapa': await cmd_startEtapa(); break;
        case 'finishEtapa': await cmd_finishEtapa(); break;
        case 'assignFuncionario': await cmd_assignFuncionario(); break;
        case 'addTeste': await cmd_addTeste(); break;
        case 'setResultadoTeste': await cmd_setResultadoTeste(); break;
        case 'generateReport': await cmd_generateReport(); break;
        default: console.log('Comando desconhecido');
      }
    }catch(err:any){ console.log('ERRO:', err.message || err); }
  }
  rl.close();
  console.log('Saindo...');
}

mainLoop().catch(e=>console.error(e));
