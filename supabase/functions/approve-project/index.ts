// Supabase Edge Function: approve-project
// 교사가 프로젝트를 승인하고 Gemini로 HTML 콘텐츠를 생성합니다.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApproveRequest {
    projectId: string;
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

        // 교사 권한 확인
        const { data: userProfile, error: profileError } = await supabase
            .from("users")
            .select("role")
            .eq("id", user.id)
            .single();

        if (profileError || !userProfile || userProfile.role !== "teacher") {
            throw new Error("교사만 프로젝트를 승인할 수 있습니다.");
        }

        // 요청 본문 파싱
        const { projectId }: ApproveRequest = await req.json();

        if (!projectId) {
            throw new Error("프로젝트 ID가 필요합니다.");
        }

        // 프로젝트 조회
        const { data: project, error: projectError } = await supabase
            .from("projects")
            .select("*")
            .eq("id", projectId)
            .single();

        if (projectError || !project) {
            throw new Error("프로젝트를 찾을 수 없습니다.");
        }

        if (project.status !== "pending") {
            throw new Error("대기 중인 프로젝트만 승인할 수 있습니다.");
        }

        // 프로젝트 이미지 조회
        const { data: images } = await supabase
            .from("project_images")
            .select("storage_path")
            .eq("project_id", projectId);

        const imageUrls = images?.map(img =>
            `${supabaseUrl}/storage/v1/object/public/project-images/${img.storage_path}`
        ) || [];

        // Gemini API 호출하여 HTML 콘텐츠 생성
        const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
        if (!geminiApiKey) {
            throw new Error("Gemini API 키가 설정되지 않았습니다.");
        }

        const generatePrompt = `당신은 수학 교육용 인터랙티브 웹 콘텐츠 개발 전문가입니다.

학생이 다음 프로젝트를 요청했습니다:

프로젝트 제목: ${project.title}

학생의 요청:
${project.prompt}

${imageUrls.length > 0 ? `참고 이미지 URL: ${imageUrls.join(', ')}` : ''}

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

        // 프로젝트 상태 업데이트
        const { error: updateError } = await supabase
            .from("projects")
            .update({
                status: "approved",
                html_content: htmlContent,
                updated_at: new Date().toISOString()
            })
            .eq("id", projectId);

        if (updateError) {
            throw new Error("프로젝트 업데이트에 실패했습니다.");
        }

        // 버전 저장
        const { data: existingVersions } = await supabase
            .from("versions")
            .select("version_number")
            .eq("project_id", projectId)
            .order("version_number", { ascending: false })
            .limit(1);

        const nextVersion = existingVersions && existingVersions.length > 0
            ? existingVersions[0].version_number + 1
            : 1;

        await supabase
            .from("versions")
            .insert({
                project_id: projectId,
                version_number: nextVersion,
                prompt: project.prompt,
                html_content: htmlContent,
                evaluation: project.evaluation,
                status: "approved"
            });

        // 활동 로그 기록
        await supabase
            .from("activity_logs")
            .insert({
                project_id: projectId,
                user_id: user.id,
                action: "project_approved",
                old_status: "pending",
                new_status: "approved",
                details: {
                    approved_by: user.id,
                    version: nextVersion
                }
            });

        return new Response(
            JSON.stringify({
                success: true,
                message: "프로젝트가 승인되었습니다.",
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
                error: error.message || "승인 처리 중 오류가 발생했습니다."
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400
            }
        );
    }
});
