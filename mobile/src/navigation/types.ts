export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainStackParamList = {
  Pairs: undefined;
  Settings: undefined;
  ChooseContact: undefined;
  CsvImport: { pairId: string };
  PairDetail: { pairId: string };
  AddTransaction: { pairId: string; transactionId?: string };
};
