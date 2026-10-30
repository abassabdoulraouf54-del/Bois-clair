/* ==========================================================
   Serveur Node.js : sert le site ET relaie le chatbot vers l'API Gemini
   (Interactions API). La clé reste ici (.env), jamais dans le navigateur.
   ========================================================== */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");

const app = express();
const CLE = (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, "");
const MODELE_ENV = (process.env.GEMINI_MODEL || "").trim();
// Modèle du .env d'abord, puis modèles de secours
const MODELES = [...new Set([MODELE_ENV, "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"].filter((m) => m.startsWith("gemini")))];
const URL_API = "https://generativelanguage.googleapis.com/v1beta/interactions";

app.use(express.json({ limit: "20kb" }));
app.use(express.static(__dirname)); // pages HTML, css/, js/

// Contexte transmis à l'IA : présentation, services, ton, limites
const CONTEXTE = `Tu es Noyer, l'assistant virtuel de l'Atelier Bois Clair, micro-entreprise de menuiserie artisanale à Cotonou (Bénin), fondée en 2019 par Koffi Adjovi.
Ton : chaleureux, simple, professionnel, vouvoiement. Réponses courtes (4 phrases maximum), en français.
Services : meubles sur mesure (table et chaises en teck dès 180 000 FCFA), agencement (bibliothèque murale dès 95 000 FCFA, cuisines sur devis), décoration en bois (dès 8 000 FCFA), restauration de meubles, mobilier pour commerces (sur devis).
Essences : teck, iroko, frêne, issus de scieries béninoises. Finitions à l'huile naturelle.
Infos pratiques : devis gratuit sous 48 h, délai moyen de 3 à 6 semaines, livraison et pose à Cotonou, Porto-Novo et Abomey-Calavi. Horaires : lundi au samedi, 8 h à 18 h. Adresse : Rue des Menuisiers, Akpakpa. Téléphone : +229 01 97 00 00 00. E-mail : contact@atelierboisclair.bj.
Règles : réponds uniquement sur l'atelier et la menuiserie. Si tu ne connais pas une information (prix exact, disponibilité), ne l'invente pas : invite à demander un devis via la page Contact.`;

// Diagnostic : la clé est-elle chargée ? (jamais affichée)
app.get("/api/health", (req, res) => {
  res.json({ cleChargee: Boolean(CLE), longueurCle: CLE.length, modeles: MODELES });
});

// Extrait le texte de la réponse : steps -> model_output -> content -> text
function extraireTexte(data) {
  const sorties = (data.steps || []).filter((s) => s.type === "model_output");
  const dernier = sorties[sorties.length - 1];
  const blocs = (dernier && dernier.content) || [];
  return blocs.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

// Appel Gemini : renvoie { ok, status, data|detail }
async function appeler(modele, input, revision) {
  const entetes = { "Content-Type": "application/json", "x-goog-api-key": CLE };
  if (revision) entetes["Api-Revision"] = revision;
  const r = await fetch(URL_API, {
    method: "POST",
    headers: entetes,
    body: JSON.stringify({
      model: modele,
      system_instruction: CONTEXTE,
      input,
      store: false,
      generation_config: { max_output_tokens: 800, thinking_level: "low" },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (r.ok) return { ok: true, status: r.status, data: await r.json() };
  return { ok: false, status: r.status, detail: (await r.text()).slice(0, 400) };
}

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: "Requête invalide" });
  if (!CLE) {
    console.error("ERREUR : GEMINI_API_KEY est vide ou absente dans .env");
    return res.status(500).json({ error: "Clé API manquante", detail: "GEMINI_API_KEY vide dans .env" });
  }

  // Historique sous forme d'étapes (mode sans état)
  const input = messages.slice(-10).map((m) => ({
    type: m.role === "model" ? "model_output" : "user_input",
    content: [{ type: "text", text: String(m.text).slice(0, 500) }],
  }));
  if (input[input.length - 1].type !== "user_input") return res.status(400).json({ error: "Requête invalide" });

  let derniereErreur = "";
  for (const modele of MODELES) {
    // 1er essai sans en-tête, 2e essai avec la révision d'API documentée par Google
    for (const revision of [null, "2026-05-20"]) {
      try {
        const r = await appeler(modele, input, revision);
        if (r.ok) {
          const reply = extraireTexte(r.data);
          return res.json({ reply: reply || "Je n'ai pas bien compris, pouvez-vous reformuler ?" });
        }
        derniereErreur = `[${modele}${revision ? " rev" : ""}] HTTP ${r.status} : ${r.detail}`;
        console.error("Gemini " + derniereErreur);
        if (r.status === 401 || r.status === 403) return res.status(502).json({ error: "Service IA indisponible", detail: derniereErreur });
      } catch (e) {
        derniereErreur = `[${modele}] Erreur réseau : ${e.message}`;
        console.error(derniereErreur);
      }
    }
  }
  res.status(502).json({ error: "Service IA indisponible", detail: derniereErreur });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Site disponible sur http://localhost:${PORT}`));
