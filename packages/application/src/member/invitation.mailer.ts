// Everything the message needs and nothing about how it is worded or where the link
// points. The implementation in `composition` owns the copy and builds the URL, which
// keeps this package free of `@loadbearing/content` and of every route.
export interface InvitationMail {
  readonly to: string;
  readonly organizationName: string;
  readonly inviterName: string;
  readonly token: string;
}

// A port in the slice rather than in `port/`: only this slice sends one, and the test
// for `port/` is whether a second feature adds a method here or a file beside it.
export abstract class InvitationMailer {
  public abstract send(mail: InvitationMail): Promise<void>;
}
