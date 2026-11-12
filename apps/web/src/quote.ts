// The quote request. There is no server behind this demo, so nothing is sent from the page:
// the request is written as an email in the customer's own mail program, for them to read
// and send. The workshop's address is a placeholder until a real maker takes this up.

import { GLAZE_NAMES, MEDALLIONS, type Bill, type Palette } from '@zellige/engine';
import type { Config } from './config';
import { int, length, m2, money } from './format';

export const QUOTE_ADDRESS = 'workshop@example.com';

/** What the design is, in plain lines: the same text goes in the email and on the spec sheet. */
export function designLines(config: Config, bill: Bill, palette: Palette): string[] {
  const lines = [
    `Centrepiece: ${MEDALLIONS[config.medallion].label}`,
    `Panel: ${length(bill.panel.sideCm)} square (${m2(bill.panel.areaM2)} m²), size ${config.size}`,
    `Pieces to cut: ${int(bill.totals.pieces)}`,
    `Tiles to buy: ${int(bill.totals.sourceTiles)} of ${bill.assumptions.tileCm} cm`,
    'Glazes:',
    ...bill.glazes.map(g => `  ${GLAZE_NAMES[g.key]} ${palette[g.key]}: ${int(g.count)} pieces`),
  ];
  if (bill.cost) lines.push(`Estimate${bill.cost.sample ? ' (sample prices)' : ''}: ${money(bill.cost.total, bill.cost.currency)}`);
  return lines;
}

export interface QuoteDetails { name: string; notes: string }

/** A mailto: link with the request written out. `link` is the address of the design. */
export function quoteMailto(config: Config, bill: Bill, palette: Palette, link: string, details: QuoteDetails): string {
  const name = details.name.trim(), notes = details.notes.trim();
  const body = [
    'Hello,',
    '',
    'Please quote for this zellige panel.',
    '',
    ...designLines(config, bill, palette),
    '',
    `Design: ${link}`,
    ...(notes ? ['', 'Notes:', notes] : []),
    '',
    'Thank you,',
    name,
  ].join('\r\n');
  const subject = `Quote request: zellige panel, ${length(bill.panel.sideCm)} square`;
  return `mailto:${QUOTE_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
