import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@4";
import { isDailyLimitReached } from "./quota.ts";

const DEFAULT_MODEL = "baidu/ernie-5.5-flash-preview:free";

const QuestionSchema = z.object({
  question: z.string(),
  category: z.enum(["HR", "Technical", "Behavioural"]),
});

const EvalSchema = z.object({
  score: z.number(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  sample_answer: z.string(),
  confidence_tip: z.string(),
});

const ResumeSchema = z.object({
  score: z.number(),
  summary: z.string(),
  skills_found: z.array(z.string()),
  missing_skills: z.array(z.string()),
  education: z.array(z.string()),
  experience: z.array(z.string()),
  strengths: z.array(z.string()),
  suggestions: z.array(z.string()),
});

const SummarySchema = z.object({
  summary: z.string(),
  skills: z.object({
    communication: z.number(),
    relevance: z.number(),
    confidence: z.number(),
    technical: z.number(),
  }),
  top_strengths: z.array(z.string()),
  top_improvements: z.array(z.string()),
});

const RequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("health"), payload: z.record(z.string(), z.unknown()).optional() }),
  z.object({
    action: z.literal("question"),
    payload: z.object({
      role: z.string().min(1).max(200),
      difficulty: z.string().min(1).max(100),
      type: z.string().min(1).max(100),
      index: z.number().int().min(0).max(40).default(0),
      total: z.number().int().min(1).max(40).default(5),
      previous: z.array(z.string().max(1000)).max(40).default([]),
    }),
  }),
  z.object({
    action: z.literal("evaluate"),
    payload: z.object({
      role: z.string().min(1).max(200),
      difficulty: z.string().min(1).max(100),
      question: z.string().min(1).max(4000),
      answer: z.string().max(20000).default(""),
    }),
  }),
  z.object({
    action: z.literal("summary"),
    payload: z.object({
      role: z.string().min(1).max(200),
      difficulty: z.string().min(1).max(100),
      type: z.string().min(1).max(100),
      items: z.array(z.object({
        question: z.string().max(4000),
        answer: z.string().max(20000).default(""),
        skipped: z.boolean().optional(),
        score: z.number().min(0).max(10),
      })).max(40),
    }),
  }),
  z.object({
    action: z.literal("resume"),
    payload: z.object({
      text: z.string().max(100000),
      role: z.string().min(1).max(200).default("Fresher (General)"),
    }),
  }),
]);

type ActionRequest = z.infer<typeof RequestSchema>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractJson(text = "") {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const from = cleaned.indexOf("{");
  const to = cleaned.lastIndexOf("}");
  if (from === -1 || to <= from) return null;
  try {
    return JSON.parse(cleaned.slice(from, to + 1));
  } catch {
    return null;
  }
}

async function ask<T extends z.ZodType>({
  system,
  prompt,
  schema,
}: {
  system: string;
  prompt: string;
  schema: T;
}): Promise<z.infer<T>> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    const error = new Error("AI not configured");
    Object.assign(error, { status: 503 });
    throw error;
  }

  const jsonSchema = z.toJSONSchema(schema);
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system",
      content: `${system}\n\nReply with only a JSON object that matches this JSON Schema, no other text:\n${JSON.stringify(jsonSchema)}`,
    },
    { role: "user", content: prompt },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "InterviewX",
      },
      body: JSON.stringify({
        model: Deno.env.get("INTERVIEWX_MODEL") || DEFAULT_MODEL,
        messages,
        response_format: { type: "json_schema", json_schema: { name: "reply", strict: true, schema: jsonSchema } },
        max_tokens: 8000,
      }),
    });
    if (!response.ok) {
      const error = new Error(`OpenRouter request failed with status ${response.status}`);
      Object.assign(error, { status: response.status });
      throw error;
    }

    const content = (await response.json()).choices?.[0]?.message?.content ?? "";
    const parsed = schema.safeParse(extractJson(content));
    if (parsed.success) return parsed.data;

    messages.push(
      { role: "assistant", content },
      { role: "user", content: `That did not match the schema (${parsed.error.message.slice(0, 500)}). Reply with only the corrected JSON object.` },
    );
  }
  throw new Error("Model did not return valid JSON after a retry");
}

const clamp = (value: number, low = 0, high = 10) => Math.max(low, Math.min(high, Math.round(Number(value) || 0)));
const take = <T,>(values: T[] | undefined, count: number, filler: T) => {
  const result = (values || []).filter(Boolean).slice(0, count);
  while (result.length < count) result.push(filler);
  return result;
};

async function askQuestion({ role, difficulty, type, index = 0, total = 5, previous = [] }: z.infer<typeof RequestSchema> extends never ? never : {
  role: string; difficulty: string; type: string; index?: number; total?: number; previous?: string[];
}) {
  const roundFor = type === "Mixed" ? ["HR", "Technical", "Behavioural"][index % 3] + " (mixed interview)" : type;
  const output = await ask({
    system:
      "You are a friendly but professional interviewer running a mock interview for students and freshers. " +
      "Ask exactly one clear, realistic interview question at a time. Keep it to one or two sentences, " +
      "no preamble, no numbering, no answer hints.",
    prompt: [
      `Role: ${role}`,
      `Difficulty: ${difficulty}`,
      `Round: ${roundFor}`,
      `This is question ${index + 1} of ${total}.` +
        (index === 0 ? " Start with a warm opener appropriate for this round." : "") +
        (index === total - 1 ? " This is the final question." : ""),
      previous.length
        ? `Questions already asked (never repeat or closely paraphrase any of these, and cover a different topic):\n${previous.map((question, i) => `${i + 1}. ${question}`).join("\n")}`
        : "No questions asked yet.",
    ].join("\n"),
    schema: QuestionSchema,
  });
  return { question: output.question.trim(), category: output.category };
}

async function evaluateAnswer({ role, difficulty, question, answer }: {
  role: string; difficulty: string; question: string; answer: string;
}) {
  const output = await ask({
    system:
      `You are a professional interviewer for the role of ${role} at ${difficulty} level. ` +
      "Evaluate the candidate's answer on clarity, relevance and confidence. Return JSON with: " +
      "score (0-10), strengths (array of 2), improvements (array of 2), sample_answer, confidence_tip. " +
      "Use simple, encouraging language. Keep each strength/improvement to one sentence and the sample answer under 120 words. " +
      "If the answer is empty, off-topic or only a few words, score it low (0-3) and say so kindly.",
    prompt: `Question: ${question}\n\nCandidate's answer:\n\"\"\"${answer || "(no answer)"}\"\"\"`,
    schema: EvalSchema,
  });
  return {
    score: clamp(output.score),
    strengths: take(output.strengths, 2, "You attempted the question — that's the first step."),
    improvements: take(output.improvements, 2, "Add a concrete example to support your point."),
    sample_answer: output.sample_answer,
    confidence_tip: output.confidence_tip,
  };
}

async function analyseResume({ text = "", role = "Fresher (General)" }: { text?: string; role?: string }) {
  const resume = String(text).slice(0, 30000);
  if (resume.trim().length < 80) {
    const error = new Error("Resume text too short");
    Object.assign(error, { status: 400 });
    throw error;
  }
  const output = await ask({
    system:
      `You are an experienced campus recruiter reviewing a student's resume for a ${role} role. ` +
      "Score it 0-100 for how ready it is to send to employers (relevance of skills, clear sections, measurable impact, projects/experience, formatting cues visible in the text). " +
      "skills_found: skills actually present in the text. missing_skills: up to 6 important skills for the role that are absent. " +
      "education and experience: short one-line summaries of entries found in the resume (empty arrays if none — never invent entries). " +
      "strengths: 3-4 items. suggestions: 4-6 specific, actionable improvements. summary: 2 sentences, encouraging and honest. " +
      "Only use information present in the resume.",
    prompt: `Resume text:\n\"\"\"\n${resume}\n\"\"\"`,
    schema: ResumeSchema,
  });
  return { ...output, mode: "claude", role, score: Math.max(0, Math.min(100, Math.round(output.score))) };
}

async function summarise({ role, difficulty, type, items = [] }: {
  role: string;
  difficulty: string;
  type: string;
  items: Array<{ question: string; answer: string; skipped?: boolean; score: number }>;
}) {
  const transcript = items
    .map((item, index) => `Q${index + 1}: ${item.question}\nAnswer: ${item.skipped ? "(skipped)" : item.answer || "(no answer)"}\nScore: ${item.score}/10`)
    .join("\n\n");
  const output = await ask({
    system:
      `You are a senior interviewer writing a short, encouraging debrief for a ${difficulty}-level ${role} candidate ` +
      `after a ${type} mock interview. Rate four skills from 0-10: communication, relevance, confidence, technical ` +
      "(technical knowledge for the role). Give exactly 3 top strengths and 3 actionable improvement tips, one sentence each. " +
      "The summary is 2-3 sentences in simple language.",
    prompt: transcript,
    schema: SummarySchema,
  });
  return {
    summary: output.summary,
    skills: Object.fromEntries(Object.entries(output.skills).map(([key, value]) => [key, clamp(value)])),
    top_strengths: take(output.top_strengths, 3, "You showed up and practised — keep the streak going."),
    top_improvements: take(output.top_improvements, 3, "Practise structuring answers with the STAR method."),
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Please sign in to continue." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !publishableKey) return json({ error: "The AI service is not ready." }, 500);

  const client = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.slice("Bearer ".length);
  const { data: claimsData, error: claimsError } = await client.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) return json({ error: "Please sign in to continue." }, 401);

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return json({ error: "The request could not be read." }, 400);
  }

  const parsed = RequestSchema.safeParse(requestBody);
  if (!parsed.success) return json({ error: "Please check the request details and try again." }, 400);
  const body: ActionRequest = parsed.data;

  if (body.action === "health") {
    return json({ ok: true, ai: Boolean(Deno.env.get("OPENROUTER_API_KEY")) });
  }
  if (!Deno.env.get("OPENROUTER_API_KEY")) return json({ error: "AI is not configured yet." }, 503);

  const { data: usageCount, error: usageError } = await client.rpc("consume_ai_call");
  if (usageError || typeof usageCount !== "number") return json({ error: "Could not check today’s AI usage." }, 500);
  if (isDailyLimitReached(usageCount)) {
    return json({ error: "You’ve reached the 40 AI calls for today. Please try again tomorrow." }, 429);
  }

  try {
    let result: unknown;
    if (body.action === "question") result = await askQuestion(body.payload);
    else if (body.action === "evaluate") result = await evaluateAnswer(body.payload);
    else if (body.action === "summary") result = await summarise(body.payload);
    else result = await analyseResume(body.payload);
    return json(result);
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 502;
    if (status === 400) return json({ error: "Please check your resume text and try again." }, 400);
    if (status === 503) return json({ error: "AI is not configured yet." }, 503);
    return json({ error: "The AI interviewer had a hiccup. Please try again." }, 502);
  }
});