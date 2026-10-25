// 서버 오류 모양. api.ts와 mocks/가 같이 써서 따로 둠 (mocks가 api.ts를 불러오면 서로 불러오는 고리가 생김)
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
