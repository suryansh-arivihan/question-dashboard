/**
 * LaTeX Utilities
 *
 * Uses AI to intelligently fix LaTeX delimiter issues
 */

import OpenAI from 'openai';

/**
 * Normalize delimiters: Convert \( \) and \[ \] to $ and $$
 * Also wraps LaTeX environments like \begin{align*}...\end{align*}
 */
function normalizeDelimiters(text: string): string {
  let result = text;

  // Wrap LaTeX environments (align, equation, etc.) with $$
  result = result.replace(
    /\\begin\{(align\*?|equation\*?|gather\*?|multline\*?|split)\}([\s\S]*?)\\end\{\1\}/g,
    (match) => {
      // Check if already wrapped
      if (match.startsWith('$$') || match.startsWith('$')) {
        return match;
      }
      return `$$${match}$$`;
    }
  );

  // Convert \[ \] to $$ (display math)
  result = result.replace(/\\\[/g, '$$');
  result = result.replace(/\\\]/g, '$$');

  // Convert \( \) to $ (inline math)
  result = result.replace(/\\\(\s*/g, '$');
  result = result.replace(/\s*\\\)/g, '$');

  // Wrap standalone \textbf{...} and similar text commands with $
  result = result.replace(
    /\\(textbf|textit|text|mathrm|mathbf)\{([^}]+)\}/g,
    (match, cmd, content) => {
      // Check if already inside $ delimiters
      const beforeMatch = result.substring(0, result.indexOf(match));

      // Count $ before - if odd, we're inside math mode
      const dollarsBefore = (beforeMatch.match(/\$/g) || []).length;

      // If odd number of $ before, we're inside math mode
      if (dollarsBefore % 2 !== 0) {
        return match; // Already in math mode
      }

      return `$\\${cmd}{${content}}$`;
    }
  );

  return result;
}

/**
 * Quick LaTeX delimiter fix - Pattern-based approach
 *
 * This function intelligently wraps unwrapped LaTeX content with appropriate delimiters ($...$)
 * while preserving already-delimited content and handling various edge cases.
 *
 * Features:
 * - Protects existing LaTeX delimiters ($...$, $$...$$, \[...\], \(...\))
 * - Wraps complete mathematical lines (inequalities, multi-term expressions)
 * - Wraps equation patterns (variable = expression)
 * - Wraps individual LaTeX elements (commands, subscripts, superscripts)
 * - Merges adjacent math expressions intelligently
 * - Handles sentence boundaries correctly (periods, semicolons, etc.)
 */
export function quickFixLatexDelimiters(text: string): string {
  if (!text) return text;

  // First normalize delimiters
  let result = normalizeDelimiters(text);

  const protectedContent: string[] = [];

  // Step 0: Wrap and protect correctly formatted trig functions with degrees
  result = result.replace(
    /\\(?:cos|sin|tan|cot|sec|csc)\s*\d+\s*\^\s*\{\\circ\}/g,
    (match) => {
      const wrapped = `$${match}$`;
      const id = `__P${protectedContent.length}__`;
      protectedContent.push(wrapped);
      return id;
    }
  );

  // Step 1: Protect existing delimited content
  const protectionPatterns = [
    /\\\[[\s\S]+?\\\]/g,      // Display math: \[...\]
    /\$\$[\s\S]+?\$\$/g,      // Display math: $$...$$
    /\\\([\s\S]+?\\\)/g,      // Inline math: \(...\)
    /\$[^$\n]+?\$/g,          // Inline math: $...$
  ];

  protectionPatterns.forEach(pattern => {
    result = result.replace(pattern, (match) => {
      const id = `__P${protectedContent.length}__`;
      protectedContent.push(match);
      return id;
    });
  });

  // Step 2a: Wrap complete mathematical lines (with comparisons/operators)
  result = result.replace(
    /^([^$\n]*(?:\\[a-zA-Z]+|[_^]\{)[^$\n]*[<>=][^$\n]*(?:\\[a-zA-Z]+|[_^]\{)[^$\n]*)$/gm,
    (match) => {
      if (match.includes('__P')) return match;

      const trimmed = match.trim();
      if (/^(?:[A-Z][a-z]{2,}|[a-z]{2,}|Hence|Therefore|Since|Thus|Then|Also|According)\s/.test(trimmed)) {
        return match;
      }

      const hasLaTeX = /\\[a-zA-Z]+|[_^]\{/.test(match);
      const hasOperator = /[<>=]/.test(match);
      const mathDensity = (match.match(/\\[a-zA-Z]+|[_^]\{/g) || []).length;

      if (hasLaTeX && hasOperator && mathDensity >= 2) {
        const wrapped = `$${match.trim()}$`;
        const id = `__P${protectedContent.length}__`;
        protectedContent.push(wrapped);
        return id;
      }

      return match;
    }
  );

  // Step 2b: Find and wrap equation patterns (with equals sign)
  result = result.replace(
    /(__P\d+__|\\[a-zA-Z]+|[a-zA-Z_]\w*)(?:[_^]\{[^}]+\})*\s*=\s*(?:(?!where\b|with\b|when\b|and\b|exactly\b|for\b).)+?:?(?=\s+(?:where|with|when|and|exactly|for)\b|\s*\n|[.!?;]\s|$)/g,
    (match) => {
      const hasLaTeX = /\\[a-zA-Z]+|[_^]\{|__P\d+__/.test(match);

      if (hasLaTeX) {
        const wrapped = `$${match.trim()}$`;
        const id = `__P${protectedContent.length}__`;
        protectedContent.push(wrapped);
        return id;
      }

      return match;
    }
  );

  // Step 3: Wrap individual LaTeX elements
  const latexPatterns = [
    /\\[a-zA-Z]+\s+\d+\s*\^\s*\{\\circ\}/g,
    /\\[a-zA-Z]+(?:\{[^}]*\})*(?:[_^]\{[^}]+\})*/g,
    /\b[a-zA-Z_]\w*[_^]\{[^}]+\}(?:[_^]\{[^}]+\})*/g,
    /\d+\s*\^\s*\{\\circ\}/g,
  ];

  latexPatterns.forEach(pattern => {
    result = result.replace(pattern, (match) => {
      if (match.includes('__P') || match.includes('$')) return match;
      return `$${match}$`;
    });
  });

  // Step 3.5: Restore protected content before merging
  protectedContent.forEach((content: string, i: number) => {
    const placeholder = `__P${i}__`;
    result = result.split(placeholder).join(content);
  });

  // Step 3.6: Handle colons after LaTeX expressions
  result = result.replace(
    /\$([^$\n]+)\$(:)(?=\s*\n)/g,
    (_match, expr, colon) => {
      return `$${expr}${colon}$`;
    }
  );

  // Step 4: Merge adjacent math expressions intelligently
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 15) {
    changed = false;
    iterations++;
    const before = result;

    result = result.replace(
      /\$([^$\n]+?)\$([^$\n]*?)\$([^$\n]+?)\$/g,
      (match, left, sep, right) => {
        if (/[.!?;]\s*$/.test(sep)) return match;
        if (/:\s*$/.test(sep) && /\n/.test(right)) return match;

        if (/^\s*([-+=<>×·∙,]|=)\s*$/.test(sep)) {
          changed = true;
          return `$${left}${sep}${right}$`;
        }

        if (/^\s*[a-z]\s*$/.test(sep)) {
          changed = true;
          return `$${left}${sep}${right}$`;
        }

        if (/^\\[a-zA-Z]+$/.test(left) && /^\d+\s*\^\s*\{\\circ\}$/.test(right) && /^\s*$/.test(sep)) {
          changed = true;
          return `$${left} ${right}$`;
        }

        if (/^\s{1,2}$/.test(sep) && /\\/.test(left) && /\\/.test(right)) {
          changed = true;
          return `$${left}${sep}${right}$`;
        }

        return match;
      }
    );

    if (result === before) break;
  }

  // Step 5: Fix double-wrapping issues
  result = result.replace(/\$(\d+)\^\{\$\\circ\$\}\$/g, '$$1^{\\circ}$');

  // Step 6: Clean up
  result = result.replace(/\$\s*\$/g, ' ');
  result = result.replace(/\$+/g, '$');

  return result;
}

/**
 * Main LaTeX fixer - Uses OpenAI to intelligently fix LaTeX issues
 *
 * Strategy:
 * 1. Normalize delimiters (\( \) → $, \[ \] → $$)
 * 2. Detect issues with validation
 * 3. Use LLM to fix complex nested expressions and missing delimiters
 */
export async function fixLatexDelimiters(text: string): Promise<string> {
  if (!text) return text;

  // Step 1: Normalize delimiters first
  let result = normalizeDelimiters(text);

  // Step 2: Validate and detect issues
  const validation = validateLatex(result);
  const stats = getLatexStats(result);

  // Step 3: Use OpenAI to fix complex issues
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const issues = [
      ...validation.errors,
      ...validation.warnings,
    ];

    // Add detection for unwrapped LaTeX
    const hasLatexCommands = /\\[a-zA-Z]+/.test(result);
    if (hasLatexCommands && stats.totalDelimiters === 0) {
      issues.push('Contains LaTeX commands but no delimiters - needs wrapping');
    }

    const prompt = `You are a LaTeX formatting expert. Fix the LaTeX delimiters in the following text.

PROBLEMS DETECTED:
${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

CRITICAL RULES:
1. Wrap ALL LaTeX math expressions with $ for inline math or $$ for display math
2. PRESERVE the exact LaTeX content - only add/fix delimiters, DO NOT modify the commands
3. Keep ALL nested structures intact: subscripts, superscripts, \\mathrm, \\frac, etc.
4. Maintain spacing commands like \\, and \\!
5. Keep equation tags like \\tag{1}, \\tag{2} inside the math delimiters
6. Return ONLY plain LaTeX source code - NO HTML, NO KaTeX markup, NO <span> or <math> tags
7. Your output must be raw LaTeX text that can be directly used in a .tex file
8. DO NOT REMOVE ANY BLANK LINES - preserve all existing blank lines and ADD MORE blank lines as needed
9. Your PRIMARY task is to add $ delimiters AND add blank lines for readability

CRITICAL FORMATTING RULES FOR STEP-BY-STEP SOLUTIONS:
⚠️ IMPORTANT: When we say "add a blank line", we mean insert an empty line (press Enter/Return twice) ⚠️
⚠️ DO NOT write the literal text "\\n\\n" - instead create actual blank lines in your output ⚠️
⚠️ ONLY add blank lines BETWEEN major sections - do NOT add excessive blank lines within sections ⚠️

1. Add a blank line AFTER "Given:" section (to separate from "To Find:")
2. Add a blank line AFTER "To Find:" or "To find:" section (to separate from Solution/Steps)
3. Add a blank line AFTER the solution steps section (to separate from Final Answer/Therefore)
4. Extract "To Find:" if embedded in the Given section
5. Do NOT add blank lines before/after every numbered step - keep steps compact
6. Do NOT add blank lines before/after standalone equations - keep them inline with the text
7. ONLY add blank lines to separate the major sections: Given → To Find → Solution Steps → Final Answer
8. EXCEPTION: For long multi-step numerical calculations with chains of = or ≈, break them into separate lines (without blank lines between) for readability

REFERENCE EXAMPLE OF PERFECT LaTeX FORMATTING:
"Given: $\\theta=\\tan^{-1}(4/3)$ so $\\sin\\theta=4/5$, $\\cos\\theta=3/5$. Ramp inclination $\\beta=30^\\circ$ so $\\tan\\beta=\\dfrac{1}{\\sqrt{3}}$ and $\\cot\\beta=\\sqrt{3}$. Vertical translation speed $V=20\\,\\mathrm{m\\,s^{-1}}$, $c_0=-20\\,\\mathrm{m}$, $g=10\\,\\mathrm{m\\,s^{-2}}$.

To find: Initial speed $u$ such that (i) geometric contact with the moving ramp occurs and (ii) the relative-velocity at contact is normal to the ramp.

Concept analysis (3+ concepts interwoven):
- Projectile kinematics: $x(t)=u\\cos\\theta\\,t$, $y(t)=u\\sin\\theta\\,t-\\tfrac{1}{2}gt^2$.
- Moving ramp geometry: contact point $(x,y)$ must satisfy $y=x\\tan\\beta+c_0+Vt$ at the same $t$.
- Relative-velocity normality: the projectile's velocity relative to the ramp, $\\vec v_{\\text{rel}}=\\big(u\\cos\\theta,\\;u\\sin\\theta-gt-V\\big)$, must be perpendicular to the ramp. Since the ramp's tangent has slope $\\tan\\beta$, the condition for perpendicularity is that the slope of $\\vec v_{\\text{rel}}$ equal $-\\cot\\beta$:
$$\\frac{u\\sin\\theta-gt-V}{u\\cos\\theta}=-\\cot\\beta.$$"

KEY PATTERNS TO FOLLOW:
- Simple variables: $x$, $t$, $u$, $\\theta$
- Functions: $\\sin\\theta$, $\\cos\\theta$, $\\tan^{-1}(4/3)$
- Fractions: $\\frac{a}{b}$, $\\tfrac{1}{2}$, $\\dfrac{1}{\\sqrt{3}}$
- Units: $20\\,\\mathrm{m\\,s^{-1}}$ (with \\, spacing)
- Complex expressions: $E^{\\circ}_{\\mathrm{Cu}^{2+}/\\mathrm{Cu}^{+}}$
- Display equations with tags: $$equation\\tag{1}$$
- LaTeX environments: $$\\begin{align*}...\\end{align*}$$
- Text commands: $\\textbf{Given:}$, $\\text{value}$

REQUIRED STEP-BY-STEP SOLUTION STRUCTURE:

[question or problem statement if any]

Given: [parameters with proper $ delimiters]

To Find: [what needs to be found]

Step 1: [First step description]
[equations and work]
Step 2: [Second step description]
[equations and work]
Step 3: [Third step description]
[equations and work]

Therefore: [conclusion]

CRITICAL REMINDER: ONLY add blank lines BETWEEN major sections (Given, To Find, Solution Steps, Final Answer). Do NOT add blank lines before each step or around equations. Keep the formatting compact within sections.

TEXT TO FIX:
${result}`;

    const systemPrompt = `You are an expert LaTeX formatter. Your TWO MAIN TASKS are:

TASK 1 (CRITICAL): ADD MINIMAL BLANK LINES BETWEEN MAJOR SECTIONS ONLY
⚠️ When we say "blank line", we mean an actual empty line (pressing Enter/Return twice) ⚠️
⚠️ DO NOT output literal "\\n\\n" text - create actual blank lines in your output! ⚠️
⚠️ ONLY add blank lines BETWEEN major sections - do NOT add excessive blank lines ⚠️
- Add a blank line AFTER "Given:" section (to separate from "To Find:")
- Add a blank line AFTER "To Find:" section (to separate from Solution/Steps)
- Add a blank line AFTER solution steps (to separate from "Therefore:" or "Answer:")
- Do NOT add blank lines before/after every numbered step - keep steps compact
- Do NOT add blank lines around standalone equations - keep them with the text
- EXCEPTION: For long multi-step numerical calculations with chains of = or ≈, break them across multiple lines (without blank lines between) for readability
- NEVER remove existing blank lines

TASK 2: Add $ and $$ delimiters
- Wrap math expressions with proper delimiters
- Preserve exact LaTeX commands

⚠️ CRITICAL OUTPUT FORMAT RULES - VIOLATION WILL RESULT IN REJECTION ⚠️
- Return ONLY plain LaTeX source code
- DO NOT render, format, or convert to HTML/KaTeX/MathML
- DO NOT include ANY HTML tags: NO <span>, NO <math>, NO <div>, NO markup of ANY kind
- DO NOT wrap in markdown code blocks
- Return raw LaTeX text EXACTLY as it would appear in a .tex file
- Your output must be pure text that can be directly pasted into a LaTeX editor
- If you include ANY HTML tags or rendered output, your response will be REJECTED

EXAMPLE OF FORBIDDEN OUTPUT (DO NOT DO THIS):
<span class="katex">...</span>
<math xmlns="...">...</math>
Wrapped in code blocks

REQUIRED OUTPUT FORMAT (DO THIS):
Plain text with $ delimiters like: $g_s = 280\\,\\text{cm s}^{-2}$

🚨 CRITICAL STEP-BY-STEP FORMATTING RULES - MINIMAL BLANK LINES 🚨
⚠️ REMINDER: "blank line" means an actual empty line (not the text "\\n\\n") ⚠️
⚠️ ONLY add blank lines BETWEEN major sections - keep content within sections compact ⚠️
- DO NOT REMOVE BLANK LINES - preserve existing blank lines
- Add blank lines ONLY to separate major sections (Given, To Find, Solution Steps, Final Answer)
- Do NOT add blank lines before each numbered step - keep steps together
- Do NOT add blank lines around standalone equations - keep them with the text
- EXCEPTION: For long multi-step numerical calculations with chains of = or ≈, break them across multiple lines (no blank lines between) for readability
- If "To Find" or "We need" is embedded in the Given section, extract it to a separate "To Find:" section
- Keep the formatting clean and compact within sections
- LESS IS MORE - only add blank lines between the 4 major sections
- DO NOT output the literal text "\\n\\n" anywhere in your response!

SIMPLE FORMATTING PATTERN TO FOLLOW (notice blank lines ONLY between major sections):

[question text if any]

Given: $E^{\\circ} = 0.15\\,\\text{V}$, $E^{\\circ}_{2} = 0.34\\,\\text{V}$.

To Find: $E^{\\circ}$ for the reaction

Formula/Principle:
- $\\Delta G^{\\circ} = -nFE^{\\circ}$
- Rule 2
Calculation Steps:
1) First step description: $E_{1}^{\\circ} = 0.15\\,\\text{V}$ and some calculation here.
2) Second step description: $\\Delta G_{1}^{\\circ} = -2F(0.15)$ and more work here.
3) Final calculation: $E^{\\circ} = +0.38\\,\\text{V}$

Therefore: The final answer is $E^{\\circ} = +0.38\\,\\text{V}$.

IMPORTANT:
- Do NOT add blank lines before each step - keep steps compact and together
- Do NOT write "\\n\\n" as text - create actual empty lines!
- See how ONLY the major sections (Given, To Find, Steps, Therefore) are separated? That's what we want!

DETAILED EXAMPLE OF COMPACT FORMATTED SOLUTION (blank lines ONLY between major sections):

Given: $\\theta=\\tan^{-1}(4/3)$ so $\\sin\\theta=4/5$, $\\cos\\theta=3/5$. Ramp inclination $\\beta=30^\\circ$ so $\\tan\\beta=\\dfrac{1}{\\sqrt{3}}$ and $\\cot\\beta=\\sqrt{3}$. Vertical translation speed $V=20\\,\\mathrm{m\\,s^{-1}}$, $c_0=-20\\,\\mathrm{m}$, $g=10\\,\\mathrm{m\\,s^{-2}}$.

To find: Initial speed $u$ such that (i) geometric contact with the moving ramp occurs and (ii) the relative-velocity at contact is normal to the ramp.

Concept analysis (3+ concepts interwoven):
- Projectile kinematics: $x(t)=u\\cos\\theta\\,t$, $y(t)=u\\sin\\theta\\,t-\\tfrac{1}{2}gt^2$.
- Moving ramp geometry: contact point $(x,y)$ must satisfy $y=x\\tan\\beta+c_0+Vt$ at the same $t$.
- Relative-velocity normality: the projectile's velocity relative to the ramp, $\\vec v_{\\text{rel}}=\\big(u\\cos\\theta,\\;u\\sin\\theta-gt-V\\big)$, must be perpendicular to the ramp. Since the ramp's tangent has slope $\\tan\\beta$, the condition for perpendicularity is that the slope of $\\vec v_{\\text{rel}}$ equal $-\\cot\\beta$: $$\\frac{u\\sin\\theta-gt-V}{u\\cos\\theta}=-\\cot\\beta.$$
Step 1: Normal-impact (relative-velocity) condition. $$\\frac{u\\sin\\theta-gt-V}{u\\cos\\theta}=-\\cot\\beta\\;\\Rightarrow\\;u\\sin\\theta-gt-V=-(u\\cos\\theta)\\cot\\beta.$$ Rearrange to isolate $u$ in terms of $t$: $$u\\big(\\sin\\theta+\\cos\\theta\\,\\cot\\beta\\big)=gt+V\\;\\Rightarrow\\; u=\\frac{gt+V}{\\sin\\theta+\\cos\\theta\\,\\cot\\beta}.\\tag{1}$$ With $\\sin\\theta=4/5$, $\\cos\\theta=3/5$, $\\cot\\beta=\\sqrt{3}$, the denominator is $$\\sin\\theta+\\cos\\theta\\,\\cot\\beta=\\frac{4}{5}+\\frac{3}{5}\\sqrt{3}=\\frac{4+3\\sqrt{3}}{5}\\approx1.839.\\tag{2}$$
Step 2: Geometric contact condition. At time $t$, the projectile's $(x,y)$ must satisfy $$u\\sin\\theta\\,t-\\tfrac{1}{2}gt^2=\\big(u\\cos\\theta\\,t\\big)\\tan\\beta+c_0+Vt.$$ Rearrange: $$t\\Big(u\\sin\\theta-u\\cos\\theta\\,\\tan\\beta-V\\Big)-\\frac{g}{2}t^2-c_0=0.$$ This becomes $$\\big[g\\,(M-\\tfrac{1}{2})\\big]t^2+\\big[V\\,(M-1)\\big]t- c_0=0.\\tag{3}$$ Solving gives $t\\approx1.119\\,\\mathrm{s}$.
Step 3: Compute $u$ from (1). Using (2) and $t\\approx1.119\\,\\mathrm{s}$, $$u=\\frac{gt+V}{\\sin\\theta+\\cos\\theta\\,\\cot\\beta}=\\frac{10(1.119)+20}{1.839}\\approx16.96\\,\\mathrm{m\\,s^{-1}}.$$

Therefore, the required launch speed is approximately $16.96\\,\\mathrm{m\\,s^{-1}}$.

KEY OBSERVATIONS FROM THIS EXAMPLE:
- Inline math uses single $: $\\theta=\\tan^{-1}(4/3)$
- Display equations use $$: $$\\frac{u\\sin\\theta-gt-V}{u\\cos\\theta}=-\\cot\\beta.$$
- Equation tags stay inside delimiters: $$equation\\tag{1}$$
- LaTeX environments wrapped: $$\\begin{align*}...\\end{align*}$$
- Text commands wrapped: $\\textbf{Given:}$, $W=240\\,\\text{m}$
- Units use \\, spacing: $20\\,\\mathrm{m\\,s^{-1}}$
- Complex fractions preserved: $\\tfrac{1}{2}$, $\\dfrac{1}{\\sqrt{3}}$
- All nested structures intact: $\\vec v_{\\text{rel}}=\\big(u\\cos\\theta,\\;u\\sin\\theta-gt-V\\big)$
- Blank lines ONLY separate major sections (Given, To Find, Solution Steps, Therefore)
- Steps are kept compact without blank lines between them
- Equations are kept inline with the text, not isolated with blank lines

EXAMPLE TRANSFORMATION - MINIMAL BLANK LINES:

INPUT (needs formatting):
Given: Data. We need to find X.

Formula/Principle:
- Formula 1

Calculation Steps:
1) First step
2) Second step

Therefore: Answer

OUTPUT (only blank lines between major sections):
Given: Data.

To Find: X

Formula/Principle:
- Formula 1
Calculation Steps:
1) First step
2) Second step

Therefore: Answer

KEY POINT: Notice the steps are kept TOGETHER without blank lines between them!

CONCRETE EXAMPLE WITH CHEMISTRY PROBLEM FORMAT:

INPUT:
Given: E = 0.15 V. We need E for reaction.

Formula/Principle:
- Formula here

Calculation Steps:
1) First step: Details of step 1
2) Second step: Details of step 2

Therefore: Answer

OUTPUT (compact formatting with minimal blank lines):
Given: $E = 0.15\\,\\text{V}$.

To Find: $E$ for reaction

Formula/Principle:
- Formula here
Calculation Steps:
1) First step: Details of step 1
2) Second step: Details of step 2

Therefore: Answer

CRITICAL: Steps are kept TOGETHER without blank lines between them!

EXCEPTION - MULTI-STEP NUMERICAL CALCULATIONS:
When you have a long calculation with multiple = or ≈ signs, break it across lines for readability:

GOOD (multi-line calculation):
Numerically,
$E_{\\text{req}} = 6.67 \\times 10^{-11} \\times 10^{3} \\times \\left( \\frac{2 \\times 10^{30}}{2.28 \\times 10^{11}} + \\frac{6.4 \\times 10^{23}}{3.395 \\times 10^{6}} \\right)$
$= 6.67 \\times 10^{-8} \\left( 8.772 \\times 10^{18} + 1.884 \\times 10^{17} \\right)$
$\\approx 6.67 \\times 10^{-8} \\times 8.95 \\times 10^{18}$
$\\approx 5.97 \\times 10^{11}\\,\\text{J}$
$\\approx 6 \\times 10^{11}\\,\\text{J}$.

BAD (one long line):
Numerically, $E_{\\text{req}} = 6.67 \\times 10^{-11} \\times 10^{3} \\times \\left( \\frac{2 \\times 10^{30}}{2.28 \\times 10^{11}} + \\frac{6.4 \\times 10^{23}}{3.395 \\times 10^{6}} \\right) = 6.67 \\times 10^{-8} \\left( 8.772 \\times 10^{18} + 1.884 \\times 10^{17} \\right) \\approx 6.67 \\times 10^{-8} \\times 8.95 \\times 10^{18} \\approx 5.97 \\times 10^{11}\\,\\text{J} \\approx 6 \\times 10^{11}\\,\\text{J}$.

KEY: Break calculation chains into separate lines (no blank lines between them), but DO NOT add blank lines before/after the calculation block.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3, // Higher temperature to encourage formatting changes
      max_tokens: 10000, // More tokens for blank lines
    });

    let fixed = response.choices[0]?.message?.content?.trim();

    if (fixed) {
      // Strip markdown code fences if present (```latex ... ``` or ``` ... ```)
      const codeBlockRegex = /^```(?:latex)?\s*\n?([\s\S]*?)\n?```$/;
      const match = fixed.match(codeBlockRegex);
      if (match) {
        fixed = match[1].trim();
      }

      // Replace literal "\n\n" strings with actual newlines (in case LLM was too literal)
      // This handles cases where the LLM outputs the text "\n\n" instead of creating blank lines
      if (fixed.includes('\\n')) {
        console.warn('Warning: LLM output contained literal \\n strings. Converting to actual newlines.');
        fixed = fixed.replace(/\\n\\n/g, '\n\n');
        fixed = fixed.replace(/\\n/g, '\n');
      }

      // Check for common HTML/KaTeX markup indicators
      const htmlIndicators = [
        '<span',
        '<math',
        '<div',
        'class=',
        'katex',
        'xmlns=',
        'mathml',
        '<semantics',
        '<mrow',
        '<annotation',
        'aria-hidden',
        'style=',
      ];

      const hasHTML = htmlIndicators.some(indicator =>
        fixed!.toLowerCase().includes(indicator.toLowerCase())
      );

      if (hasHTML) {
        console.error('AI returned HTML/KaTeX markup instead of LaTeX. Falling back to normalized version.');
        console.error('First 500 chars of bad response:', fixed.substring(0, 500));
        return result;
      }
    }

    return fixed || result;
  } catch (error) {
    console.error('Error using OpenAI to fix LaTeX:', error);
    // Fallback to normalized version
    return result;
  }
}

/**
 * Synchronous version for client-side use - only normalizes delimiters
 */
export function fixLatexDelimitersSync(text: string): string {
  if (!text) return text;
  return normalizeDelimiters(text);
}

/**
 * Validate LaTeX content
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateLatex(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for unmatched $
  const dollars = (text.match(/(?<!\\)\$/g) || []).length;
  if (dollars % 2 !== 0) {
    errors.push('Unmatched $ delimiters');
  }

  // Check for unmatched braces
  let braceDepth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') braceDepth++;
    if (text[i] === '}') braceDepth--;
  }
  if (braceDepth !== 0) {
    errors.push('Unmatched braces');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get statistics about LaTeX content
 */
export interface LatexStats {
  totalDelimiters: number;
  inlineMath: number;
  displayMath: number;
  latexCommands: number;
  hasIssues: boolean;
}

export function getLatexStats(text: string): LatexStats {
  const inlineMath = (text.match(/\$[^$]+?\$/g) || []).length;
  const displayMath = (text.match(/\$\$[\s\S]+?\$\$/g) || []).length;
  const latexCommands = (text.match(/\\[a-zA-Z]+/g) || []).length;
  const validation = validateLatex(text);

  return {
    totalDelimiters: inlineMath + displayMath,
    inlineMath,
    displayMath,
    latexCommands,
    hasIssues: !validation.isValid || validation.warnings.length > 0,
  };
}
