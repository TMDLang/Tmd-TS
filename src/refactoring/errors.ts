export class TmdRefactorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TmdRefactorError";
  }
}
