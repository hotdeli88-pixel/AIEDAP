import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

class GeminiService:
    def __init__(self):
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            raise ValueError("GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.")
        
        genai.configure(api_key=api_key)
        # Gemini 3 Pro Preview 모델 사용
        self.model = genai.GenerativeModel('gemini-3-pro-preview')

    def generate_html_content(self, prompt, student_name=""):
        """프롬프트를 기반으로 HTML 콘텐츠 생성"""
        system_prompt = f"""당신은 수학 교육용 인터랙티브 콘텐츠를 만드는 전문가입니다.
학생 '{student_name}'이 제시한 프롬프트를 바탕으로 HTML 기반의 교육용 콘텐츠를 만들어주세요.

요구사항:
1. 완전한 HTML 문서 형태로 작성 (DOCTYPE, html, head, body 포함)
2. 수학 개념을 시각적이고 인터랙티브하게 표현
3. CSS는 <style> 태그 내에 포함
4. JavaScript는 <script> 태그 내에 포함하여 인터랙티브 기능 구현
5. 반응형 디자인 적용
6. 아름답고 현대적인 UI/UX

프롬프트: {prompt}

HTML 코드만 반환하세요. 설명이나 마크다운 코드 블록 없이 순수 HTML만 제공해주세요."""

        try:
            response = self.model.generate_content(
                system_prompt,
                generation_config={
                    "temperature": 0.7,
                    "top_p": 0.95,
                    "top_k": 40,
                }
            )
            html_content = response.text.strip()
            
            # 마크다운 코드 블록 제거 (있는 경우)
            if html_content.startswith('```'):
                lines = html_content.split('\n')
                html_content = '\n'.join(lines[1:-1]) if lines[-1].startswith('```') else '\n'.join(lines[1:])
            
            return html_content
        except Exception as e:
            raise Exception(f"콘텐츠 생성 중 오류 발생: {str(e)}")

    def evaluate_prompt(self, prompt, student_name=""):
        """프롬프트 평가 (내부 메서드)"""
        evaluation_prompt = f"""당신은 수학 교육 전문가입니다. 학생이 제시한 프롬프트가 수학 학습 내용을 바탕으로 한 적절한 콘텐츠 제작 요청인지 평가해주세요.

평가 기준:
1. 수학 학습 내용과의 연관성 (1-5점)
2. 프롬프트의 명확성과 구체성 (1-5점)
3. 교육적 가치 (1-5점)
4. 실현 가능성 (1-5점)

학생 이름: {student_name}
프롬프트: {prompt}

다음 형식으로 JSON 응답해주세요:
{{
    "overall_score": 점수(1-5),
    "scores": {{
        "relevance": 점수,
        "clarity": 점수,
        "educational_value": 점수,
        "feasibility": 점수
    }},
    "feedback": "간단한 피드백 메시지",
    "suggestions": ["개선 제안 1", "개선 제안 2"]
}}"""

        try:
            response = self.model.generate_content(evaluation_prompt)
            return response.text
        except Exception as e:
            raise Exception(f"평가 중 오류 발생: {str(e)}")

