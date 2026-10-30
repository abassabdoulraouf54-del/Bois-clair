/* ==========================================================
   Atelier Bois Clair — script.js
   1) Ombre de la barre de navigation au scroll
   2) Apparition des éléments au scroll
   3) Validation du formulaire de contact
   4) Chatbot connecté à une API IA via le serveur proxy (/api/chat)
   ========================================================== */
document.documentElement.classList.add("js");

/* ---------- 1) Barre de navigation ---------- */
const navbar = document.getElementById("navbar");
const majNavbar = () => navbar.classList.toggle("scrolled", window.scrollY > 10);
window.addEventListener("scroll", majNavbar, { passive: true });
majNavbar();

/* ---------- 2) Apparition au scroll (IntersectionObserver) ---------- */
const observateur = new IntersectionObserver((entrees) => {
  entrees.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("visible"); observateur.unobserve(e.target); }
  });
}, { threshold: 0.15 });
document.querySelectorAll(".reveal").forEach((el) => observateur.observe(el));

/* ---------- 3) Validation du formulaire de contact ---------- */
const form = document.getElementById("formContact");
if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    // Validation native HTML5 + messages Bootstrap (.invalid-feedback)
    const valide = form.checkValidity();
    form.classList.add("was-validated");
    if (!valide) return;
    // Projet fictif : aucun envoi réel, on affiche une confirmation
    document.getElementById("formSucces").classList.remove("d-none");
    form.reset();
    form.classList.remove("was-validated");
  });
}

/* ---------- 4) Chatbot ---------- */
(function chatbot() {
  const API_URL = "/api/chat"; // Le serveur Node ajoute la clé API : elle n'est JAMAIS dans ce fichier
  const historique = [];       // Conversation envoyée à chaque requête

  // Construction de l'interface (bulle + fenêtre)
  const bulle = document.createElement("button");
  bulle.className = "chat-bulle";
  bulle.setAttribute("aria-label", "Ouvrir l'assistant");
  bulle.textContent = "💬";

  const fenetre = document.createElement("div");
  fenetre.className = "chat-fenetre";
  fenetre.setAttribute("role", "dialog");
  fenetre.setAttribute("aria-label", "Assistant Atelier Bois Clair");
  fenetre.innerHTML = `
    <div class="chat-entete"><span>Noyer, assistant de l'atelier</span><button class="chat-fermer" aria-label="Fermer">×</button></div>
    <div class="chat-messages" aria-live="polite"></div>
    <form class="chat-form"><input type="text" placeholder="Posez votre question…" aria-label="Votre message" maxlength="500" required><button type="submit">Envoyer</button></form>`;
  document.body.append(bulle, fenetre);

  const zone = fenetre.querySelector(".chat-messages");
  const champ = fenetre.querySelector("input");

  const ajouter = (texte, auteur) => {
    const m = document.createElement("div");
    m.className = "msg " + auteur;
    m.textContent = texte;
    zone.appendChild(m);
    zone.scrollTop = zone.scrollHeight;
    return m;
  };

  // Ouverture / fermeture
  const basculer = () => {
    fenetre.classList.toggle("ouverte");
    if (fenetre.classList.contains("ouverte")) {
      if (!zone.children.length) ajouter("Bonjour, je suis Noyer, l'assistant de l'Atelier Bois Clair ! Je peux vous renseigner sur nos meubles, nos délais et nos tarifs.", "bot");
      champ.focus();
    }
  };
  bulle.addEventListener("click", basculer);
  fenetre.querySelector(".chat-fermer").addEventListener("click", basculer);

  // Envoi d'un message au serveur (fetch)
  fenetre.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const texte = champ.value.trim();
    if (!texte) return;
    ajouter(texte, "user");
    champ.value = "";
    champ.disabled = true; // empêche l'envoi double pendant l'attente
    historique.push({ role: "user", text: texte });
    const attente = ajouter("…", "bot");
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000); // 30 s max
      const reponse = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historique.slice(-10) }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!reponse.ok) throw new Error("HTTP " + reponse.status);
      const data = await reponse.json();
      if (data.error) throw new Error(data.error);
      attente.textContent = data.reply;
      historique.push({ role: "model", text: data.reply });
    } catch (err) {
      if (err.name === "AbortError") {
        attente.textContent = "La réponse prend trop de temps. Veuillez réessayer ou contactez-nous au +229 01 97 00 00 00.";
      } else if (err.message.includes("429") || err.message.includes("Quota")) {
        attente.textContent = "⏳ Le quota journalier du chatbot est atteint (limite Free Tier). Réessayez demain ou contactez-nous directement au +229 01 97 00 00 00.";
      } else {
        attente.textContent = "[" + err.message + "] L'assistant est indisponible pour le moment. Écrivez-nous via la page Contact ou appelez le +229 01 97 00 00 00.";
      }
      historique.pop();
    } finally {
      champ.disabled = false;
      champ.focus();
    }
    zone.scrollTop = zone.scrollHeight;
  });
})();