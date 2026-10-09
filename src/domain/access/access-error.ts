/** Failures that can occur when deciding whether to serve a request. */
export type AccessError =
  | Readonly<{ kind: "UnknownHost"; host: string }>
  | Readonly<{ kind: "IpForbidden" }>
  | Readonly<{ kind: "SignatureRequired" }>
  | Readonly<{ kind: "SignatureInvalid" }>
  | Readonly<{ kind: "Expired"; expiresAt: Date }>
  | Readonly<{ kind: "ParameterOverrideForbidden" }>
  | Readonly<{ kind: "ParameterNotAllowed"; key: string }>;
