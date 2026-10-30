/* ==========================================================
   Fonction Vercel : relaie le chatbot vers l'API Gemini (Interactions API).
   La clé est lue dans les variables d'environnement Vercel, jamais dans le code.
   ========================================================== */
const URL_API = "https://generativelanguage.googleapis.com/v1beta/interactions";

// Contexte transmis à l'IA : présentation, services, ton, limites
const CONTEXTE = `Tu es Noyer, l'assistant virtuel de l'Atelier Bois Clair, micro-entreprise de menuiserie artisanale à Cotonou (Bénin), fondée en 2019 par Koffi Adjovi.
Ton : chaleureux, simple, professionnel, vouvoiement. Réponses courtes (4 phrases maximum), en français.
Services : meubles sur mesure (table et chaises en teck dès 180 000 FCFA), agencement (bibliothèque murale dès 95 000 FCFA, cuisines sur devis), décoration en bois (dès 8 000 FCFA), restauration de meubles, mobilier pour commerces (sur devis).
Essences : teck, iroko, frêne, issus de scieries béninoises. Finitions à l'huile naturelle.
Infos pratiques : devis gratuit sous 48 h, délai moyen de 3 à 6 semaines, livraison et pose à Cotonou, Porto-Novo et Abomey-Calavi. Horaires : lundi au samedi, 8 h à 18 h. Adresse : Rue des Menuisiers, Akpakpa. Téléphone : +229 01 97 00 00 00. E-mail : contact@atelierboisclair.bj.
Règles : réponds uniquement sur l'atelier et la menuiserie. Si tu ne connais pas une information (prix exact, disponibilité), ne l'invente pas : invite à demander un devis via la page Contact.`;

// Extrait le texte de la réponse : steps -> model_output -> content -> text
function extraireTexte(data) {
  const sorties = (data.steps || []).filter((s) => s.type === "model_output");
  const dernier = sorties[sorties.length - 1];
  const blocs = (dernier && dernier.content) || [];
  return blocs.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const cle = (process.env.GEMINI_API_KEY || "").trim();
  if (!cle) return res.status(500).json({ error: "Clé API manquante" });

  const messages = req.body && req.body.messages;
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: "Requête invalide" });

  // Conversation envoyée sous forme d'un seul message (format simple et fiable)
  const recents = messages.slice(-10);
  if (recents[recents.length - 1].role === "model") return res.status(400).json({ error: "Requête invalide" });
  const transcript = recents
    .map((m) => (m.role === "model" ? "Noyer : " : "Client : ") + String(m.text).slice(0, 500))
    .join("\n");
  const input = [{
    type: "user_input",
    content: [{ type: "text", text: "Conversation en cours :\n" + transcript + "\n\nRéponds uniquement au dernier message du client, en tant que Noyer." }],
  }];

  // Modèle du réglage Vercel d'abord, puis modèles de secours (quota par modèle)
  const modeles = [...new Set([process.env.GEMINI_MODEL, "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
    .map((m) => (m || "").trim()).filter((m) => m.startsWith("gemini")))];

  for (const modele of modeles) {
    try {
      const r = await fetch(URL_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": cle },
        body: JSON.stringify({
          model: modele,
          system_instruction: CONTEXTE,
          input,
          store: false,
          generation_config: { max_output_tokens: 800, thinking_level: "low" },
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) {
        const reply = extraireTexte(await r.json());
        return res.status(200).json({ reply: reply || "Je n'ai pas bien compris, pouvez-vous reformuler ?" });
      }
      console.error(`Gemini [${modele}] HTTP ${r.status} : ${(await r.text()).slice(0, 300)}`);
      if (r.status === 401 || r.status === 403) break; // clé refusée : inutile d'essayer les autres
    } catch (e) {
      console.error(`Erreur réseau [${modele}] : ${e.message}`);
    }
  }
  res.status(502).json({ error: "Service IA indisponible" });
};
