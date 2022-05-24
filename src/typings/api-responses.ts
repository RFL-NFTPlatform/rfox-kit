export type ProofApiResponse = {
  proof: string[];
};

export type ErrorApiResponse = {
  message: string;
};


export type RfoxTvProofResponse = {
  externalId: string[];
  salt: string;
  signature: string;
}