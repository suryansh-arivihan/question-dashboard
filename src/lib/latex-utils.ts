/**
 * LaTeX Utilities
 *
 * Uses AI to intelligently fix LaTeX delimiter issues
 */

import OpenAI from 'openai';

/**
 * Normalize delimiters: Convert \( \) and \[ \] to $ and $$
 */
function normalizeDelimiters(text: string): string {
  let result = text;

  // Convert \[ \] to $$ (display math)
  result = result.replace(/\\\[/g, '$$');
  result = result.replace(/\\\]/g, '$$');

  // Convert \( \) to $ (inline math)
  result = result.replace(/\\\(\s*/g, '$');
  result = result.replace(/\s*\\\)/g, '$');

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
6. PRESERVE all line breaks (\\n) and paragraph spacing from the input text EXACTLY as they are
7. Add blank lines between major sections (Given:, Formula:, Steps:, Therefore:, etc.)
8. Keep each numbered step on a new line (Step 1:, Step 2:, 1), 2), etc.)
9. Add line breaks after display equations ($$...$$) when appropriate
10. Return ONLY the fixed text with no explanations or markdown formatting

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

STEP-BY-STEP SOLUTION STRUCTURE (preserve line breaks):
Given: [parameters with proper $ delimiters]

Formula/Principle:
- [formula 1]
- [formula 2]

Calculation Steps:
1) [First step description]
$$[equation if any]$$

2) [Second step description]
$$[equation if any]$$

Therefore: [conclusion]

TEXT TO FIX:
${result}`;

    const systemPrompt = `You are an expert LaTeX formatter specializing in mathematical and scientific notation. Your task is to add proper $ and $$ delimiters around math expressions while preserving the exact LaTeX commands, structure, spacing, and formatting. Never modify the mathematical content itself - only add the missing delimiters.

IMPORTANT FORMATTING RULES:
- PRESERVE all line breaks (\\n) from the input text EXACTLY as they appear
- Keep each numbered step on its own line (e.g., "Step 1:", "1)", "2)", etc.)
- Add blank lines between major sections like "Given:", "Formula/Principle:", "Calculation Steps:", "Therefore:"
- Add line breaks after display equations ($$...$$)
- The output structure and line breaks must exactly match the input structure

EXAMPLE OF PERFECTLY FORMATTED SOLUTION (USE THIS AS YOUR REFERENCE):

Given: $\\theta=\\tan^{-1}(4/3)$ so $\\sin\\theta=4/5$, $\\cos\\theta=3/5$. Ramp inclination $\\beta=30^\\circ$ so $\\tan\\beta=\\dfrac{1}{\\sqrt{3}}$ and $\\cot\\beta=\\sqrt{3}$. Vertical translation speed $V=20\\,\\mathrm{m\\,s^{-1}}$, $c_0=-20\\,\\mathrm{m}$, $g=10\\,\\mathrm{m\\,s^{-2}}$.

To find: Initial speed $u$ such that (i) geometric contact with the moving ramp occurs and (ii) the relative-velocity at contact is normal to the ramp.

Concept analysis (3+ concepts interwoven):
- Projectile kinematics: $x(t)=u\\cos\\theta\\,t$, $y(t)=u\\sin\\theta\\,t-\\tfrac{1}{2}gt^2$.
- Moving ramp geometry: contact point $(x,y)$ must satisfy $y=x\\tan\\beta+c_0+Vt$ at the same $t$.
- Relative-velocity normality: the projectile's velocity relative to the ramp, $\\vec v_{\\text{rel}}=\\big(u\\cos\\theta,\\;u\\sin\\theta-gt-V\\big)$, must be perpendicular to the ramp. Since the ramp's tangent has slope $\\tan\\beta$, the condition for perpendicularity is that the slope of $\\vec v_{\\text{rel}}$ equal $-\\cot\\beta$:
$$\\frac{u\\sin\\theta-gt-V}{u\\cos\\theta}=-\\cot\\beta.$$

Step 1: Normal-impact (relative-velocity) condition.
$$\\frac{u\\sin\\theta-gt-V}{u\\cos\\theta}=-\\cot\\beta\\;\\Rightarrow\\;u\\sin\\theta-gt-V=-(u\\cos\\theta)\\cot\\beta.$$
Rearrange to isolate $u$ in terms of $t$:
$$u\\big(\\sin\\theta+\\cos\\theta\\,\\cot\\beta\\big)=gt+V\\;\\Rightarrow\\; u=\\frac{gt+V}{\\sin\\theta+\\cos\\theta\\,\\cot\\beta}.\\tag{1}$$
With $\\sin\\theta=4/5$, $\\cos\\theta=3/5$, $\\cot\\beta=\\sqrt{3}$, the denominator is
$$\\sin\\theta+\\cos\\theta\\,\\cot\\beta=\\frac{4}{5}+\\frac{3}{5}\\sqrt{3}=\\frac{4+3\\sqrt{3}}{5}\\approx1.839230484.\\tag{2}$$

Step 2: Geometric contact (intersection) condition with the translating ramp.
At time $t$, the projectile's $(x,y)$ must satisfy
$$u\\sin\\theta\\,t-\\tfrac{1}{2}gt^2=\\big(u\\cos\\theta\\,t\\big)\\tan\\beta+c_0+Vt.$$
Rearrange and factor $t$ on the left:
$$t\\Big(u\\sin\\theta-u\\cos\\theta\\,\\tan\\beta-V\\Big)-\\frac{g}{2}t^2-c_0=0.$$
Insert $u$ from (1) to eliminate $u$. Define for compactness
$$M\\equiv\\frac{\\sin\\theta-\\cos\\theta\\,\\tan\\beta}{\\sin\\theta+\\cos\\theta\\,\\cot\\beta}.$$
Then the intersection equation becomes a quadratic in $t$:
$$\\big[g\\,(M-\\tfrac{1}{2})\\big]t^2+\\big[V\\,(M-1)\\big]t- c_0=0.\\tag{3}$$
Numerical evaluation with $\\sin\\theta=4/5$, $\\cos\\theta=3/5$, $\\tan\\beta=1/\\sqrt{3}$, $\\cot\\beta=\\sqrt{3}$ gives
$$M=\\frac{\\tfrac{4}{5}-\\tfrac{3}{5}\\cdot\\tfrac{1}{\\sqrt{3}}}{\\tfrac{4}{5}+\\tfrac{3}{5}\\sqrt{3}}\\approx0.246653379.$$
Hence
$$g\\,(M-\\tfrac{1}{2})\\approx10(-0.253346621)=-2.53346621,\\qquad V\\,(M-1)\\approx20(-0.753346621)=-15.06693242.$$
With $c_0=-20\\,\\mathrm{m}$, equation (3) is
$$(-2.53346621)\\,t^2+(-15.06693242)\\,t+20=0.$$
Solve for the physically admissible $t>0$:
$$\\Delta=b^2-4ac=(-15.0669)^2-4(-2.53347)(20)\\approx429.69,\\quad \\sqrt\\Delta\\approx20.738,$$
$$t=\\frac{-b-\\sqrt\\Delta}{2a}=\\frac{15.0669-20.738}{2(-2.53347)}\\approx\\frac{-5.6711}{-5.0669}\\approx1.119\\,\\mathrm{s}.$$
(The other root is negative and is discarded.)

Step 3: Compute $u$ from (1).
Using (2) and $t\\approx1.119\\,\\mathrm{s}$,
$$u=\\frac{gt+V}{\\sin\\theta+\\cos\\theta\\,\\cot\\beta}=\\frac{10(1.119)+20}{1.839230484}\\approx\\frac{31.19}{1.83923}\\approx16.96\\,\\mathrm{m\\,s^{-1}}.$$

Final check (consistency): With $u\\approx16.96\\,\\mathrm{m\\,s^{-1}}$, $\\vec v_{\\text{rel}}$ at impact satisfies the slope condition $\\dfrac{v_{y}-V}{v_x}=-\\cot\\beta$, ensuring normal incidence in the ramp's instantaneous rest frame, and the intersection condition is met by construction.

Therefore, the required launch speed is approximately $16.96\\,\\mathrm{m\\,s^{-1}}$.

KEY OBSERVATIONS FROM THIS EXAMPLE:
- Inline math uses single $: $\\theta=\\tan^{-1}(4/3)$
- Display equations use $$: $$\\frac{u\\sin\\theta-gt-V}{u\\cos\\theta}=-\\cot\\beta.$$
- Equation tags stay inside delimiters: $$equation\\tag{1}$$
- Units use \\, spacing: $20\\,\\mathrm{m\\,s^{-1}}$
- Complex fractions preserved: $\\tfrac{1}{2}$, $\\dfrac{1}{\\sqrt{3}}$
- All nested structures intact: $\\vec v_{\\text{rel}}=\\big(u\\cos\\theta,\\;u\\sin\\theta-gt-V\\big)$
- Blank lines separate major sections (Given:, Step 1:, Step 2:, Therefore:)
- Line breaks after display equations ($$...$$) and before new sections
- Each numbered step (Step 1:, Step 2:, etc.) starts on a new line with proper spacing`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
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
      temperature: 0.1, // Low temperature for consistent formatting
      max_tokens: 8000,
    });

    const fixed = response.choices[0]?.message?.content?.trim();
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
