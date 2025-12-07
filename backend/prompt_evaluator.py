import json
import re

class PromptEvaluator:
    def __init__(self, gemini_service):
        self.gemini_service = gemini_service

    def evaluate(self, prompt, student_name=""):
        """프롬프트를 평가하고 구조화된 결과 반환"""
        try:
            raw_response = self.gemini_service.evaluate_prompt(prompt, student_name)
            
            # JSON 추출 시도
            evaluation = self._parse_evaluation_response(raw_response)
            
            # 기본값 설정
            default_evaluation = {
                "overall_score": 3,
                "scores": {
                    "relevance": 3,
                    "clarity": 3,
                    "educational_value": 3,
                    "feasibility": 3
                },
                "feedback": "프롬프트를 평가했습니다.",
                "suggestions": ["더 구체적인 설명을 추가해보세요."],
                "is_appropriate": True
            }
            
            # 파싱된 결과와 기본값 병합
            if evaluation:
                default_evaluation.update(evaluation)
            
            # 적절성 판단 (overall_score 3 이상이면 적절)
            default_evaluation["is_appropriate"] = default_evaluation.get("overall_score", 3) >= 3
            
            return default_evaluation
            
        except Exception as e:
            # 오류 발생 시 기본 평가 반환
            return {
                "overall_score": 3,
                "scores": {
                    "relevance": 3,
                    "clarity": 3,
                    "educational_value": 3,
                    "feasibility": 3
                },
                "feedback": f"평가 중 오류가 발생했습니다: {str(e)}",
                "suggestions": ["프롬프트를 다시 확인해주세요."],
                "is_appropriate": True
            }

    def _parse_evaluation_response(self, response_text):
        """Gemini 응답에서 JSON 추출"""
        try:
            # JSON 코드 블록 찾기
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                json_str = json_match.group(0)
                return json.loads(json_str)
            
            # 직접 JSON 파싱 시도
            return json.loads(response_text)
        except:
            # 파싱 실패 시 None 반환
            return None

