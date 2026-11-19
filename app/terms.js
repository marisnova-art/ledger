// Words shown on screen, per book type. 개인 books use plain everyday words; 개인사업자·법인 books use
// standard accounting terms because 세무사/회계 staff read the shared data. Add a key here instead of
// hard-coding a label in a screen; every book type must define every key.
export const TERMS = {
  personal: { in: '들어온 돈', out: '나간 돈', net: '남긴 돈', left: '남은 돈', cash: '내 돈' },
  business: { in: '매출', out: '비용', net: '순이익', left: '순이익', cash: '현금·예금 잔액' },
  corp: { in: '매출', out: '비용', net: '순이익', left: '순이익', cash: '현금·예금 잔액' }
};
export const termsFor = kind => TERMS[kind] || TERMS.personal;
