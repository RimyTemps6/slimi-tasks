import React, { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch
} from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "./firebase";
import { DEFAULT_PET, PETS } from "./data/pets";

const friendlyErrors = {
  "auth/email-already-in-use": "Este e-mail já tem uma conta. Entre com sua senha.",
  "auth/invalid-email": "Confira o formato do e-mail.",
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/weak-password": "Use uma senha com pelo menos 6 caracteres.",
  "auth/too-many-requests": "Muitas tentativas. Espere um pouco e tente de novo."
};

function getErrorMessage(error) {
  return friendlyErrors[error?.code] || error?.message || "Não foi possível concluir. Tente novamente.";
}

function getLevelProgress(petData) {
  return Math.max(0, Math.min(100, petData.xp || 0));
}

function getPetMood(petData) {
  if (petData.satiety <= 25) return "Estou com fome! 🍎";
  if (petData.energy <= 20) return "Preciso descansar um pouquinho… 😴";
  if (petData.happiness >= 80) return "Que dia feliz para brincar! ✨";
  return "Vamos cuidar um do outro? 💛";
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState("");
  const [pet, setPet] = useState(PETS[0]);
  const [petData, setPetData] = useState(DEFAULT_PET);
  const [page, setPage] = useState("home");
  const [busy, setBusy] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return undefined;
    }
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    let cancelled = false;
    setLoadingData(true);
    setError("");
    Promise.all([loadTasks(user.uid), loadPet(user.uid, pet.id)])
      .catch((err) => { if (!cancelled) setError(getErrorMessage(err)); })
      .finally(() => { if (!cancelled) setLoadingData(false); });
    return () => { cancelled = true; };
  }, [user, pet.id]);

  async function loadTasks(uid = user?.uid) {
    if (!uid || !db) return;
    const snapshot = await getDocs(collection(db, "users", uid, "tasks"));
    setTasks(snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
  }

  async function loadPet(uid = user?.uid, petId = pet.id) {
    if (!uid || !db) return;
    const ref = doc(db, "users", uid, "pets", petId);
    const snapshot = await getDoc(ref);
    if (snapshot.exists()) {
      setPetData({ ...DEFAULT_PET, ...snapshot.data() });
    } else {
      await setDoc(ref, DEFAULT_PET);
      setPetData(DEFAULT_PET);
    }
  }

  async function runAction(action, successMessage) {
    try {
      setBusy(true);
      setError("");
      setNotice("");
      await action();
      if (successMessage) setNotice(successMessage);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAuth(event) {
    event.preventDefault();
    if (!auth) return setError("O Firebase ainda não foi configurado para este site.");
    if (password.length < 6) return setError("A senha precisa ter pelo menos 6 caracteres.");
    await runAction(async () => {
      if (authMode === "register") {
        if (!name.trim()) throw new Error("Digite seu nome para criar a conta.");
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: name.trim() });
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    });
  }

  async function addTask(event) {
    event?.preventDefault();
    const title = newTask.trim();
    if (!title || !user || !db || busy) return;
    if (title.length > 120) return setError("A tarefa pode ter até 120 caracteres.");
    await runAction(async () => {
      await addDoc(collection(db, "users", user.uid, "tasks"), {
        title,
        completed: false,
        createdAt: serverTimestamp()
      });
      setNewTask("");
      await loadTasks();
    }, "Tarefa adicionada ✨");
  }

  async function completeTask(task) {
    if (!user || !db || task.completed || busy) return;
    const totalXp = (petData.xp || 0) + 20;
    const updates = {
      xp: totalXp % 100,
      level: (petData.level || 1) + Math.floor(totalXp / 100),
      happiness: Math.min(100, (petData.happiness || 0) + 6),
      energy: Math.max(0, (petData.energy || 0) - 5)
    };
    await runAction(async () => {
      const batch = writeBatch(db);
      batch.update(doc(db, "users", user.uid, "tasks", task.id), { completed: true, completedAt: serverTimestamp() });
      batch.set(doc(db, "users", user.uid, "pets", pet.id), updates, { merge: true });
      await batch.commit();
      setPetData({ ...petData, ...updates });
      await loadTasks();
    }, `Tarefa concluída! ${pet.name} ganhou carinho e experiência 🐾`);
  }

  async function removeTask(taskId) {
    if (!user || !db || busy) return;
    await runAction(async () => {
      await deleteDoc(doc(db, "users", user.uid, "tasks", taskId));
      await loadTasks();
    }, "Tarefa removida.");
  }

  async function careForPet(action) {
    if (!user || !db || busy) return;
    const changes = {
      feed: { satiety: Math.min(100, petData.satiety + 25), happiness: Math.min(100, petData.happiness + 4) },
      play: { energy: Math.max(0, petData.energy - 20), happiness: Math.min(100, petData.happiness + 14), xp: petData.xp + 5 },
      rest: { energy: Math.min(100, petData.energy + 35) }
    }[action];
    if (action === "play" && petData.energy < 15) {
      return setError(`${pet.name} precisa descansar antes de brincar.`);
    }
    if (action === "feed" && petData.satiety >= 100) return setNotice(`${pet.name} está de barriguinha cheia!`);
    const updates = { ...changes, lastCareAt: serverTimestamp() };
    await runAction(async () => {
      await setDoc(doc(db, "users", user.uid, "pets", pet.id), updates, { merge: true });
      const next = { ...petData, ...changes };
      if (next.xp >= 100) {
        next.xp -= 100;
        next.level += 1;
      }
      setPetData(next);
      if (next.xp !== changes.xp && changes.xp !== undefined) {
        await setDoc(doc(db, "users", user.uid, "pets", pet.id), { xp: next.xp, level: next.level }, { merge: true });
      }
    }, action === "feed" ? `${pet.name} adorou a comidinha 🍎` : action === "play" ? `Foi divertido brincar com ${pet.name}!` : `${pet.name} está descansando 😴`);
  }

  if (!isFirebaseConfigured) {
    return <main className="setup-screen">
      <div className="setup-card">
        <span className="brand-mark">💧</span>
        <p className="eyebrow">UM MUNDO PARA CUIDAR</p>
        <h1>Slimi Tasks</h1>
        <p>O app precisa ser conectado ao Firebase para você criar sua conta e salvar suas tarefas e pets.</p>
        <div className="setup-note">Configuração do Firebase pendente. Assim que o app Web for ligado ao projeto, esta tela dará lugar ao login.</div>
      </div>
    </main>;
  }

  if (!authReady) return <main className="loading-screen"><span className="spinner" />Preparando seu cantinho…</main>;

  if (!user) {
    return <main className="auth-screen">
      <div className="auth-art" aria-hidden="true"><span className="bubble bubble-one" /><span className="bubble bubble-two" /><span className="auth-pet">💧</span><span className="sparkle sparkle-one">✦</span><span className="sparkle sparkle-two">✧</span></div>
      <section className="auth-card">
        <div className="brand-lockup"><span className="brand-mark small">💧</span><span>Slimi Tasks</span></div>
        <p className="eyebrow">CRESÇA NO SEU RITMO</p>
        <h1>{authMode === "login" ? "Que bom ter você de volta" : "Vamos criar seu cantinho"}</h1>
        <p className="auth-description">Tarefas pequenas, carinho grande. Seu companheiro está esperando por você.</p>
        <form onSubmit={handleAuth}>
          {authMode === "register" && <label>Como podemos te chamar?<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome" required /></label>}
          <label>Seu e-mail<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" required /></label>
          <label>Sua senha<input type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Pelo menos 6 caracteres" minLength="6" required /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary-button full-width" disabled={busy}>{busy ? "Só um instante…" : authMode === "login" ? "Entrar no meu mundo" : "Criar minha conta"}</button>
        </form>
        <p className="auth-switch">{authMode === "login" ? "Ainda não tem uma conta?" : "Já tem uma conta?"} <button className="text-button" onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setError(""); }}>{authMode === "login" ? "Criar conta" : "Fazer login"}</button></p>
        <p className="privacy-note">Seus dados e seu progresso ficam guardados com segurança na sua conta.</p>
      </section>
    </main>;
  }

  const completedTasks = tasks.filter((task) => task.completed).length;
  const openTasks = tasks.filter((task) => !task.completed);
  const progress = getLevelProgress(petData);
  const greetingName = user.displayName?.split(" ")[0] || "amigo";

  return <main className="app-shell">
    <aside className="sidebar">
      <a className="brand-lockup" href="#inicio" onClick={(event) => { event.preventDefault(); setPage("home"); }}><span className="brand-mark small">💧</span><span>Slimi Tasks</span></a>
      <p className="sidebar-label">SEU ESPAÇO</p>
      <nav className="main-nav" aria-label="Navegação principal">
        <button className={page === "home" ? "active" : ""} onClick={() => setPage("home")}><span>⌂</span> Visão geral</button>
        <button className={page === "tasks" ? "active" : ""} onClick={() => setPage("tasks")}><span>✓</span> Minhas tarefas <i>{openTasks.length}</i></button>
        <button className={page === "pets" ? "active" : ""} onClick={() => setPage("pets")}><span>♡</span> Meus companheiros</button>
      </nav>
      <div className="sidebar-pet-card"><span>{pet.emoji}</span><div><strong>{pet.name}</strong><small>Nível {petData.level}</small></div><span className="online-dot" /></div>
      <div className="sidebar-footer"><span className="avatar">{greetingName.slice(0, 1).toUpperCase()}</span><div><strong>{greetingName}</strong><small>seu espaço seguro</small></div><button className="icon-button" title="Sair da conta" aria-label="Sair da conta" onClick={() => signOut(auth)}>↗</button></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><p className="eyebrow">SEU CANTINHO, SEU RITMO</p><h1>{page === "home" ? `Olá, ${greetingName}!` : page === "tasks" ? "Suas tarefas" : "Seus companheiros"}</h1></div><div className="topbar-date"><span>☀</span><span>Um passo de cada vez</span></div></header>
      {error && <p className="error global-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Fechar aviso">×</button></p>}
      {notice && <p className="success global-error" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Fechar aviso">×</button></p>}
      {loadingData && <p className="loading-note"><span className="spinner small-spinner" /> Sincronizando seu progresso…</p>}

      {page === "home" && <>
        <section className="hero-card" style={{ "--pet-color": pet.color }}>
          <div className="hero-copy"><span className="hero-kicker">SEU COMPANHEIRO DE HOJE</span><h2>Pequenas conquistas<br />fazem dias felizes.</h2><p>Complete uma tarefa e celebre com {pet.name}.</p><button className="primary-button" onClick={() => setPage("tasks")}>Ver minhas tarefas <span>→</span></button></div>
          <div className="hero-creature" aria-label={`${pet.name}, seu companheiro`}><span>{pet.emoji}</span><i>✦</i><b>✧</b></div>
          <div className="hero-stats"><div><span>✦</span><strong>Nível {petData.level}</strong><small>companheiro</small></div><div><span>✓</span><strong>{completedTasks}</strong><small>tarefas concluídas</small></div><div><span>♡</span><strong>{petData.happiness}%</strong><small>felicidade</small></div></div>
        </section>
        <div className="section-heading"><div><p className="eyebrow">UM POUQUINHO DE CADA VEZ</p><h2>Seu dia está florescendo</h2></div><button className="quiet-button" onClick={() => setPage("tasks")}>Ver tudo <span>→</span></button></div>
        <div className="dashboard-grid">
          <section className="surface daily-card"><div className="surface-heading"><div><span className="heading-icon lilac">✧</span><div><h3>Próximas tarefas</h3><p>O que você quer realizar?</p></div></div><button className="add-icon" onClick={() => setPage("tasks")} aria-label="Adicionar tarefa">＋</button></div>
            {openTasks.slice(0, 3).map((task) => <div className="mini-task" key={task.id}><button className="check-circle" onClick={() => completeTask(task)} aria-label={`Concluir ${task.title}`}>✓</button><span>{task.title}</span></div>)}
            {!openTasks.length && <div className="empty-state compact"><span>🌱</span><p>Nenhuma tarefa por agora.<br />Que tal adicionar uma?</p></div>}
          </section>
          <section className="surface bond-card"><div className="surface-heading"><div><span className="heading-icon pink">♡</span><div><h3>Seu laço especial</h3><p>Você e {pet.name}</p></div></div><button className="quiet-button" onClick={() => setPage("pets")}>Cuidar <span>→</span></button></div>
            <div className="bond-pet"><span>{pet.emoji}</span><div><strong>{getPetMood(petData)}</strong><div className="level-track"><i style={{ width: `${progress}%` }} /></div><small>{progress} / 100 de carinho para o próximo nível</small></div></div>
            <div className="bond-footer"><span>🍎 Barriguinha <b>{petData.satiety}%</b></span><span>⚡ Energia <b>{petData.energy}%</b></span></div>
          </section>
        </div>
      </>}

      {page === "tasks" && <section className="surface tasks-page"><div className="section-heading compact-heading"><div><p className="eyebrow">VOCÊ CONSEGUE</p><h2>Um passo de cada vez ✨</h2><p className="section-subtitle">Cada tarefa concluída dá experiência para seu companheiro.</p></div><span className="task-count">{openTasks.length} em aberto</span></div>
        <form className="task-composer" onSubmit={addTask}><span className="composer-icon">✎</span><input value={newTask} onChange={(event) => setNewTask(event.target.value)} maxLength="120" placeholder="Escreva uma tarefa que quer fazer…" aria-label="Nova tarefa" /><button className="primary-button" disabled={busy || !newTask.trim()}>Adicionar tarefa <span>＋</span></button></form>
        <div className="task-list">{tasks.map((task) => <article className={`task-row ${task.completed ? "is-complete" : ""}`} key={task.id}><button className="check-circle" onClick={() => !task.completed && completeTask(task)} disabled={task.completed || busy} aria-label={task.completed ? "Tarefa concluída" : `Concluir ${task.title}`}>{task.completed ? "✓" : ""}</button><div className="task-copy"><strong>{task.title}</strong><small>{task.completed ? "Concluída · você conseguiu!" : "Uma pequena conquista esperando por você"}</small></div>{!task.completed && <span className="xp-tag">+20 XP</span>}<button className="delete-task" onClick={() => removeTask(task.id)} disabled={busy} aria-label={`Excluir ${task.title}`}>×</button></article>)}
          {!tasks.length && <div className="empty-state"><span>📝</span><h3>Sua lista começa com uma ideia</h3><p>Adicione uma tarefa pequena e veja seu companheiro crescer com você.</p></div>}
        </div>
        <div className="completed-summary"><span>✦</span><p>Você já concluiu <strong>{completedTasks} {completedTasks === 1 ? "tarefa" : "tarefas"}</strong>. Cada passo merece ser celebrado.</p></div>
      </section>}

      {page === "pets" && <section className="pets-page">
        <div className="section-heading compact-heading"><div><p className="eyebrow">AMIZADES QUE CRESCEM</p><h2>Escolha quem fica pertinho 🐾</h2><p className="section-subtitle">Cada companheiro tem seu jeitinho. Cuide de todos no seu tempo.</p></div></div>
        <div className="pet-roster">{PETS.map((item) => <button key={item.id} className={`roster-card ${pet.id === item.id ? "selected" : ""}`} onClick={() => { setPet(item); setPetData(DEFAULT_PET); setError(""); }} style={{ "--pet-color": item.color }}><span className="roster-emoji">{item.emoji}</span><span className="roster-info"><strong>{item.name}</strong><small>{item.description}</small></span><span className="roster-level">Nv. {pet.id === item.id ? petData.level : "1"}</span></button>)}</div>
        <section className="surface care-panel" style={{ "--pet-color": pet.color }}>
          <div className="care-portrait"><span className="care-sparkle one">✦</span><span className="care-sparkle two">✧</span><div className="care-creature">{pet.emoji}</div><div className="mood-bubble">{getPetMood(petData)}</div></div>
          <div className="care-content"><p className="eyebrow">SEU COMPANHEIRO</p><h2>{pet.name}</h2><p className="pet-personality">{pet.personality} · {pet.description}</p>
            <div className="level-display"><div><strong>Nível {petData.level}</strong><span>{progress} / 100 XP</span></div><div className="level-track"><i style={{ width: `${progress}%` }} /></div></div>
            <div className="care-meters"><Meter icon="🍎" label="Barriguinha" value={petData.satiety} /><Meter icon="♡" label="Felicidade" value={petData.happiness} /><Meter icon="⚡" label="Energia" value={petData.energy} /></div>
            <div className="care-actions"><button className="care-button feed" onClick={() => careForPet("feed")} disabled={busy || petData.satiety >= 100}><span>🍎</span><strong>Dar comidinha</strong><small>+25 barriguinha</small></button><button className="care-button play" onClick={() => careForPet("play")} disabled={busy || petData.energy < 15}><span>🎾</span><strong>Brincar</strong><small>+14 felicidade · +5 XP</small></button><button className="care-button rest" onClick={() => careForPet("rest")} disabled={busy || petData.energy >= 100}><span>🌙</span><strong>Descansar</strong><small>+35 energia</small></button></div>
          </div>
        </section>
        <p className="gentle-note">♡ O progresso de cada companheiro é salvo separadamente na sua conta.</p>
      </section>}
      <footer className="workspace-footer"><span>Feito com carinho</span><span>💧</span><span>Seu progresso é só seu</span></footer>
    </section>
  </main>;
}

function Meter({ icon, label, value = 0 }) {
  return <div className="meter"><div><span>{icon} {label}</span><strong>{value}%</strong></div><div className="meter-track"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div></div>;
}
