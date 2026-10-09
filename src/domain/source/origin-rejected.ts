/** The origin returned an error (404, etc.). The status and body are returned to the client as is. */
export type OriginRejected = Readonly<{ kind: "OriginRejected"; status: number; body: string; contentType?: string }>;
