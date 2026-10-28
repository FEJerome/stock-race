export class ContractError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, message: string, path = "") {
    super(message);
    this.name = "ContractError";
    this.code = code;
    this.path = path;
  }
}
