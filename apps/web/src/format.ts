// How numbers are written for the customer.

export const int = (n: number) => n.toLocaleString('en');
export const m2 = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 208 → '2.08 m'; 96.6 → '96.6 cm'. */
export const length = (cm: number) => (cm >= 100 ? `${(cm / 100).toLocaleString('en', { maximumFractionDigits: 2 })} m` : `${cm.toLocaleString('en', { maximumFractionDigits: 1 })} cm`);
export const cm1 = (n: number) => n.toLocaleString('en', { maximumFractionDigits: 1 });
export const money = (n: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
