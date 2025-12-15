// Supabase Edge Function: evaluate-prompt
// Gemini API를 사용하여 학생의 프롬프트를 평가합니다.
// 2022 개정 교육과정 기반 평가 지원

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EvaluationRequest {
    prompt: string;
    title: string;
    imageUrls?: string[];
    templateId?: string;  // 템플릿 ID (선택적)
}

interface TemplateInfo {
    grade: number;
    math_domain: string;
    unit_name: string | null;
    achievement_standard_code: string | null;
    achievement_standard: string;
    learning_objectives: any[];
    expected_level: string;
    guidelines: string;
    ai_restrictions: string | null;
}

interface EvaluationResult {
    scores: {
        creativity: number;
        clarity: number;
        mathRelevance: number;
        feasibility: number;
        overall: number;
        objectiveAlignment?: number;      // 학습목표 부합도
        achievementStandardFit?: number;  // 성취기준 연계도
        guidelineCompliance?: number;     // 기본지침 준수도
    };
    feedback: string;
    suggestions: string[];
    achievementLevelEstimate?: string;  // 예상 성취수준 (A/B/C/D/E)
    gradeAppropriateness?: {
        isAppropriate: boolean;
        reason: string;
    };
    curriculumNotes?: string;  // 교육과정 연계 노트
}

// 수학 영역 한글 변환
function getMathDomainLabel(domain: string): string {
    const labels: Record<string, string> = {
        'number_operation': '수와 연산',
        'algebra': '문자와 식',
        'function': '함수',
        'geometry': '기하',
        'statistics': '확률과 통계'
    };
    return labels[domain] || domain;
}

// 성취수준 추정
function estimateAchievementLevel(overallScore: number): string {
    if (overallScore >= 9) return 'A';
    if (overallScore >= 7) return 'B';
    if (overallScore >= 5) return 'C';
    if (overallScore >= 3) return 'D';
    return 'E';
}

serve(async (req: Request) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // 인증 확인
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            throw new Error("인증이 필요합니다.");
        }

        // Supabase 클라이언트 생성
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 사용자 확인
        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError || !user) {
            throw new Error("유효하지 않은 인증 토큰입니다.");
        }

        // 요청 본문 파싱
        const { prompt, title, imageUrls, templateId }: EvaluationRequest = await req.json();

        if (!prompt || !title) {
            throw new Error("프롬프트와 제목이 필요합니다.");
        }

        // 템플릿 정보 조회 (있는 경우)
        let template: TemplateInfo | null = null;
        if (templateId) {
            const { data: templateData, error: templateError } = await supabase
                .from('project_templates')
                .select('grade, math_domain, unit_name, achievement_standard_code, achievement_standard, learning_objectives, expected_level, guidelines, ai_restrictions')
                .eq('id', templateId)
                .single();

            if (!templateError && templateData) {
                template = templateData as TemplateInfo;
            }
        }

        // Gemini API 호출
        const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
        if (!geminiApiKey) {
            throw new Error("Gemini API 키가 설정되지 않았습니다.");
        }

        // 템플릿 기반 평가 프롬프트 생성
        let evaluationPrompt: string;

        if (template) {
            // 학습목표 문자열 생성
            const objectivesText = Array.isArray(template.learning_objectives)
                ? template.learning_objectives.map((obj: any, i: number) =>
                    `${i + 1}. ${obj.content || obj}`).join('\n')
                : '';

            evaluationPrompt = `당신은 중학교 수학 교육 전문가입니다. 2022 개정 교육과정에 따라 학생의 프로젝트 프롬프트를 평가합니다.

[평가 컨텍스트]
- 학생 학년: 중학교 ${template.grade}학년
- 수학 영역: ${getMathDomainLabel(template.math_domain)}
${template.unit_name ? `- 단원: ${template.unit_name}` : ''}
${template.achievement_standard_code ? `- 성취기준 코드: ${template.achievement_standard_code}` : ''}
- 성취기준: ${template.achievement_standard}
- 기대 성취수준: ${template.expected_level}등급

[학습목표]
${objectivesText || '(학습목표 없음)'}

[교사 기본지침]
${template.guidelines}

${template.ai_restrictions ? `[AI 피드백 제한사항]\n${template.ai_restrictions}` : ''}

[추가 제한사항]
- 중학교 ${template.grade}학년 수준을 벗어나는 고급 수학 개념(미적분, 복소수, 행렬, 삼각함수의 고급 활용 등)은 언급하지 마세요
- 해당 학년에서 아직 배우지 않은 내용은 피드백에서 제외하세요
- 2022 개정 교육과정 범위 내에서만 피드백하세요

[평가 대상]
프로젝트 제목: ${title}

학생의 프롬프트:
${prompt}

${imageUrls && imageUrls.length > 0 ? `첨부된 이미지: ${imageUrls.length}개` : ''}

다음 기준으로 1-10점 척도로 평가하고, JSON 형식으로 응답해주세요:

[기본 평가 항목]
1. creativity (창의성): 아이디어가 독창적이고 흥미로운가?
2. clarity (명확성): 프롬프트가 명확하고 이해하기 쉬운가?
3. mathRelevance (수학 관련성): 수학 개념과 잘 연결되어 있는가?
4. feasibility (실현 가능성): 실제로 구현 가능한 콘텐츠인가?

[22개정 교육과정 특화 평가 항목]
5. objectiveAlignment (학습목표 부합도): 학습목표에 부합하는가?
6. achievementStandardFit (성취기준 연계도): 성취기준과 연계되어 있는가?
7. guidelineCompliance (기본지침 준수도): 교사의 기본지침을 준수하는가?

8. overall (종합 점수): 전체적인 평가 점수

또한 다음을 포함해주세요:
- feedback: 중${template.grade} 학생에게 적합한 수준으로 전달할 피드백 (2-3문장, 해당 학년 수준에 맞게)
- suggestions: 프롬프트를 개선할 수 있는 구체적인 제안 (배열, 최대 3개, 해당 학년 수준에 맞게)
- gradeAppropriateness: {
    "isAppropriate": 학년 수준에 적합한지 (true/false),
    "reason": 적합성에 대한 설명
  }
- curriculumNotes: 22개정 교육과정과의 연계성 설명 (1문장)

응답 형식:
{
    "scores": {
        "creativity": 숫자,
        "clarity": 숫자,
        "mathRelevance": 숫자,
        "feasibility": 숫자,
        "objectiveAlignment": 숫자,
        "achievementStandardFit": 숫자,
        "guidelineCompliance": 숫자,
        "overall": 숫자
    },
    "feedback": "피드백 문자열",
    "suggestions": ["제안1", "제안2", "제안3"],
    "gradeAppropriateness": {
        "isAppropriate": true/false,
        "reason": "적합성 설명"
    },
    "curriculumNotes": "교육과정 연계 설명"
}

JSON만 응답해주세요.`;
        } else {
            // 템플릿 없이 기본 평가
            evaluationPrompt = `당신은 수학 교육 전문가입니다. 학생이 수학 수업 후 만들고 싶은 인터랙티브 콘텐츠에 대해 작성한 프롬프트를 평가해주세요.

프로젝트 제목: ${title}

학생의 프롬프트:
${prompt}

${imageUrls && imageUrls.length > 0 ? `첨부된 이미지: ${imageUrls.length}개` : ''}

다음 기준으로 1-10점 척도로 평가하고, JSON 형식으로 응답해주세요:
1. creativity (창의성): 아이디어가 독창적이고 흥미로운가?
2. clarity (명확성): 프롬프트가 명확하고 이해하기 쉬운가?
3. mathRelevance (수학 관련성): 수학 개념과 잘 연결되어 있는가?
4. feasibility (실현 가능성): 실제로 구현 가능한 콘텐츠인가?
5. overall (종합 점수): 전체적인 평가 점수

또한 다음을 포함해주세요:
- feedback: 학생에게 전달할 전반적인 피드백 (2-3문장)
- suggestions: 프롬프트를 개선할 수 있는 구체적인 제안 (배열, 최대 3개)

응답 형식:
{
    "scores": {
        "creativity": 숫자,
        "clarity": 숫자,
        "mathRelevance": 숫자,
        "feasibility": 숫자,
        "overall": 숫자
    },
    "feedback": "피드백 문자열",
    "suggestions": ["제안1", "제안2", "제안3"]
}

JSON만 응답해주세요.`;
        }

        const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: evaluationPrompt }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 1024,
                    }
                })
            }
        );

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error("Gemini API error:", errorText);
            throw new Error("AI 평가 요청에 실패했습니다.");
        }

        const geminiData = await geminiResponse.json();
        const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!responseText) {
            throw new Error("AI 응답을 받지 못했습니다.");
        }

        // JSON 파싱 (```json 블록 제거)
        let cleanedResponse = responseText.trim();
        if (cleanedResponse.startsWith("```json")) {
            cleanedResponse = cleanedResponse.slice(7);
        }
        if (cleanedResponse.startsWith("```")) {
            cleanedResponse = cleanedResponse.slice(3);
        }
        if (cleanedResponse.endsWith("```")) {
            cleanedResponse = cleanedResponse.slice(0, -3);
        }
        cleanedResponse = cleanedResponse.trim();

        const evaluation: EvaluationResult = JSON.parse(cleanedResponse);

        // 성취수준 추정 추가 (템플릿이 있는 경우)
        if (template && evaluation.scores.overall) {
            evaluation.achievementLevelEstimate = estimateAchievementLevel(evaluation.scores.overall);
        }

        return new Response(
            JSON.stringify({
                success: true,
                evaluation
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200
            }
        );

    } catch (error) {
        console.error("Error:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error.message || "평가 처리 중 오류가 발생했습니다."
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400
            }
        );
    }
});
