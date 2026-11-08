import { NextResponse } from "next/server";
import { answerDeterministic } from "@/lib/deterministic";
import { answerWithLlm } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const body = (await req.json()) as { messages?: Msg[] };
  const messages = (body.messages ?? []).filter((m) => m.content?.trim()).slice(-12);
  const last = messages.at(-1);
  if (!last || last.role !== "user") {
    return NextResponse.json({ error: "Aucune question reçue." }, { status: 400 });
  }
  try {
    const result = process.env.ANTHROPIC_API_KEY
      ? await answerWithLlm(messages)
      : await answerDeterministic(last.content);
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Impossible de répondre : vérifiez que Grafana, le serveur MCP et PostgreSQL sont démarrés." },
      { status: 502 },
    );
  }
}
