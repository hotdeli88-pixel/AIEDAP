// Supabase Edge Function: generate-content
// Gemini API를 사용하여 HTML 인터랙티브 콘텐츠를 생성합니다.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateRequest {
    prompt: string;
    title: string;
    imageUrls?: string[];
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
        const { prompt, title, imageUrls }: GenerateRequest = await req.json();

        if (!prompt || !title) {
            throw new Error("프롬프트와 제목이 필요합니다.");
        }

        // Gemini API 호출
        const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
        if (!geminiApiKey) {
            throw new Error("Gemini API 키가 설정되지 않았습니다.");
        }

        const generatePrompt = `당신은 수학 교육용 인터랙티브 웹 콘텐츠 개발 전문가입니다.

학생이 다음 프로젝트를 요청했습니다:

프로젝트 제목: ${title}

학생의 요청:
${prompt}

${imageUrls && imageUrls.length > 0 ? `참고 이미지 URL: ${imageUrls.join(', ')}` : ''}

위 콘텐츠를 HTML 기반 인터랙티브 콘텐츠로 만들어주세요.

요구사항:
1. 완전히 독립적으로 실행 가능한 단일 HTML 파일로 작성
2. CSS는 <style> 태그 내에, JavaScript는 <script> 태그 내에 포함
3. 반응형 디자인 적용 (모바일/태블릿/데스크톱)
4. 사용자 인터랙션 요소 포함 (버튼, 슬라이더, 입력 필드 등)
5. 시각적으로 매력적인 디자인 (그라데이션, 애니메이션 등)
6. 수학 개념을 효과적으로 전달할 수 있는 시각화
7. 한국어로 작성
8. 외부 라이브러리 사용 가능 (CDN 링크 사용)

HTML 코드만 응답해주세요. 설명이나 마크다운 블록 없이 순수 HTML만 반환하세요.`;

        const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: generatePrompt }]
                    }],
                    generationConfig: {
                        temperature: 0.8,
                        maxOutputTokens: 8192,
                    }
                })
            }
        );

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error("Gemini API error:", errorText);
            throw new Error("콘텐츠 생성 요청에 실패했습니다.");
        }

        const geminiData = await geminiResponse.json();
        let htmlContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!htmlContent) {
            throw new Error("콘텐츠를 생성하지 못했습니다.");
        }

        // HTML 코드 정리 (```html 블록 제거)
        htmlContent = htmlContent.trim();
        if (htmlContent.startsWith("```html")) {
            htmlContent = htmlContent.slice(7);
        }
        if (htmlContent.startsWith("```")) {
            htmlContent = htmlContent.slice(3);
        }
        if (htmlContent.endsWith("```")) {
            htmlContent = htmlContent.slice(0, -3);
        }
        htmlContent = htmlContent.trim();

        return new Response(
            JSON.stringify({
                success: true,
                htmlContent
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
                error: error.message || "콘텐츠 생성 중 오류가 발생했습니다."
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400
            }
        );
    }
});
