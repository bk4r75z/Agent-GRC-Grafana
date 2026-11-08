"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type Source = { n: number; title: string; url: string; origin: string };
type Trace = { tool: string; via: string; detail?: string };
type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  trace?: Trace[];
  mode?: string;
  model?: string;
  error?: boolean;
};

const SUGGESTIONS = [
  "Quels sont les risques cyber les plus importants ?",
  "Quelles nouvelles réglementations devons-nous surveiller ?",
  "Quels risques devons-nous traiter en priorité ?",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function ask(question: string) {
    if (!question.trim() || loading) return;
    const history: Message[] = [...messages, { role: "user", content: question.trim() }];
    setMessages(history);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.filter((m) => !m.error).map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();
      setMessages([
        ...history,
        res.ok
          ? { role: "assistant", content: data.answer, sources: data.sources, trace: data.trace, mode: data.mode, model: data.model }
          : { role: "assistant", content: data.error ?? "Erreur inconnue.", error: true },
      ]);
    } catch {
      setMessages([...history, { role: "assistant", content: "Le serveur ne répond pas.", error: true }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="top">
        <div>
          <h1>Assistant GRC</h1>
          <p>Veille cyber (CERT-FR) et réglementaire (EUR-Lex) · Grafana via MCP · PostgreSQL</p>
        </div>
        <a className="btn-ghost" href={process.env.NEXT_PUBLIC_GRAFANA_URL ?? "http://localhost:3000"} target="_blank" rel="noreferrer">
          Ouvrir le dashboard ↗
        </a>
      </header>

      <section className="thread">
        {messages.length === 0 && (
          <div className="empty">
            <p>Posez une question sur les risques détectés par l&apos;agent de veille. Chaque réponse cite ses sources.</p>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <article key={i} className={`msg ${m.role}${m.error ? " error" : ""}`}>
            {m.role === "assistant" ? (
              <>
                <div className="md">
                  <ReactMarkdown
                    components={{
                      a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                </div>
                {m.sources && m.sources.length > 0 && (
                  <div className="sources">
                    <h3>Sources</h3>
                    <ol>
                      {m.sources.map((s) => (
                        <li key={s.n} value={s.n}>
                          <span className={`tag tag-${s.origin.startsWith("Grafana") ? "grafana" : s.origin === "EUR-Lex" ? "eurlex" : "certfr"}`}>{s.origin}</span>
                          <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {m.trace && m.trace.length > 0 && (
                  <details className="trace">
                    <summary>
                      {m.trace.length} appels d&apos;outils · mode {m.mode === "llm" ? `LLM (${m.model})` : "déterministe"}
                    </summary>
                    <ul>
                      {m.trace.map((t, j) => (
                        <li key={j}><code>{t.tool}</code> <em>via {t.via}</em>{t.detail ? ` — ${t.detail}` : ""}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <p>{m.content}</p>
            )}
          </article>
        ))}
        {loading && <article className="msg assistant pending">Interrogation de Grafana (MCP) et de la base…</article>}
        <div ref={endRef} />
      </section>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ex. : Quels risques devons-nous traiter en priorité ?"
          aria-label="Votre question"
        />
        <button type="submit" disabled={loading || !input.trim()}>Envoyer</button>
      </form>
    </main>
  );
}
