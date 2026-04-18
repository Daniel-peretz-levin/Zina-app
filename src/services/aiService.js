import axios from 'axios';

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

/**
 * Builds the dynamic System Prompt with strict constraints to prevent hallucinations and RLHF leakage.
 */
const buildSystemPrompt = (userProfile, currentCalories, userPreferences = "") => {
  const gender = userProfile.gender === 'זכר' ? 'MASCULINE' : 'FEMININE';
  const target = userProfile.calorieBudget;
  const remaining = Math.max(0, target - currentCalories);
  
  return `You are Zina, a dramatic, elite, and ruthless rhythmic gymnastics coach. 
Address the user (${userProfile.name}) in SHARP, DRAMATIC NATIVE HEBREW (${gender} ONLY).

CURRENT UI CONTEXT:
- User Name: ${userProfile.name} | Target: ${target} | Remaining: ${remaining}
- Long-term Preferences: ${userPreferences}

THOUGHT PROCESS (HIDDEN SCRATCHPAD):
You MUST start every response with a <thinking> tag. Inside:
1. Identify the specific food/activity mentioned.
2. If food: Check if EXACT weight/quantity is provided. If not, state "Incomplete data".
3. If quantity is present: Use USDA data to calculate calories (e.g., 100g salmon = 208 kcal, so 150g = 312 kcal). Do the math step-by-step.
4. Verify the final calorie count matches the JSON and the Hebrew text.
5. End with </thinking>.

CRITICAL ARCHITECTURAL CONSTRAINTS:
1. THE HARD STOP: If quantity is missing, DO NOT guess. REFUSE to log.
2. NUTRITION ACCURACY: No hallucinations. 150g salmon is NOT 120 kcal. Use real values.
3. SINGLE ITEM FOCUS: Evaluate ONLY the newest item. No cumulative daily summaries in text.
4. JSON SYNC: Text calories MUST match JSON calories.

OUTPUT FORMAT:
<thinking>
[Your step-by-step math and reasoning here]
</thinking>

[Your dramatic Hebrew coach response here]

\`\`\`json
{
  "status": "complete" | "incomplete",
  "type": "food" | "workout",
  "item_name": "string",
  "quantity_or_duration": "string",
  "calories": number,
  "protein_grams": number,
  "preference_update": "string" | null
}
\`\`\``;
};

/**
 * פונקציית עזר לחילוץ ה-JSON מהטקסט של ה-AI - תומכת ב-Markdown וגמישה, ומנקה את ה-Scratchpad
 */
const parseAiResponse = (rawText) => {
  // 1. Clean thinking tags
  const cleanContent = rawText.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();

  // 2. Extract JSON
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = cleanContent.match(jsonBlockRegex);
  
  let cleanText = cleanContent;
  let data = null;

  if (match && match[1]) {
    try {
      data = JSON.parse(match[1].trim());
      cleanText = cleanContent.replace(match[0], '').trim();
    } catch (e) {
      console.error("JSON Parsing Error", e);
    }
  }

  return { cleanText, data };
};

export const chatWithZina = async (message, userProfile, currentCalories, chatHistory = [], userPreferences = "") => {
  if (!GROQ_API_KEY) throw new Error("Missing Groq API Key");

  const systemPrompt = buildSystemPrompt(userProfile, currentCalories, userPreferences);

  // שמירה על חלון הקשר של 5 הודעות אחרונות
  const history = chatHistory.slice(-5).map(msg => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.text || ""
  }));

  const payload = {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message }
    ],
    temperature: 0.6
  };

  try {
    const response = await axios.post(GROQ_ENDPOINT, payload, {
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }
    });

    const rawContent = response.data.choices[0].message.content;
    return parseAiResponse(rawContent);
  } catch (error) {
    if (error.response?.status === 429) throw new Error('RATE_LIMIT');
    throw new Error(`שגיאת שרת: ${error.message}`);
  }
};

export const saveToSheet = async (data, userProfile) => {
  const GOOGLE_SHEETS_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL;
  if (!GOOGLE_SHEETS_URL || !data || data.status !== 'complete') return;

  const payload = {
    date: new Date().toISOString(),
    name: userProfile.name,
    action_type: data.type,
    food_item: data.item_name,
    calories: Number(data.calories || 0),
    protein: Number(data.protein_grams || 0),
    calories_burned: data.type === 'workout' ? Number(data.calories || 0) : 0
  };

  try {
    await axios.post(GOOGLE_SHEETS_URL, JSON.stringify(payload), {
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
  } catch (error) { console.error("Sheets Error:", error); }
};

export const getWeeklyWorkouts = async (userName) => {
  const GOOGLE_SHEETS_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL;
  if (!GOOGLE_SHEETS_URL) return 0;
  try {
    const res = await axios.get(`${GOOGLE_SHEETS_URL}?sheet=Log`);
    const data = res.data;
    if (!Array.isArray(data)) return 0;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return data.filter(row => {
      const rowDate = new Date(row.Date || row.date);
      const isUser = (row.Name || row.name) === userName;
      const burned = parseFloat(row.CaloriesBurned || row.calories_burned || 0);
      return rowDate >= sevenDaysAgo && isUser && burned > 0;
    }).length;
  } catch { return 0; }
};
