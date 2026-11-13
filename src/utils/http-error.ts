/**
 * Error with an HTTP status. Services throw it for expected failures
 * (not found, not owned, expired); controllers turn it into a JSON response.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
