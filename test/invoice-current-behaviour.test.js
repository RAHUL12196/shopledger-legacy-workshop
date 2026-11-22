const test = require('node:test');
const assert = require('node:assert/strict');

const invoice = require('../lib/invoice');
const pricing = require('../lib/pricing');
const reports = require('../lib/reports');
const tax = require('../lib/tax');

test('invoice uses the same HSN rate and totals as order pricing', () => {
  const items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }
  ];

  const billed = pricing.computeTotals(items, '');
  const printed = invoice.computeInvoiceFigures({ items, coupon: '' });

  assert.equal(tax.getRateForItem(items[0]), 0.05);
  assert.equal(billed.tax, 5);
  assert.equal(billed.total, 105);
  assert.equal(printed.rows[0].gstPercent, 5);
  assert.equal(printed.tax, billed.tax);
  assert.equal(printed.total, billed.total);
});

test('invoice applies the same capped coupon discount and totals as order pricing', () => {
  const items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 3000, qty: 1 }
  ];

  const billed = pricing.computeTotals(items, 'SAVE10');
  const printed = invoice.computeInvoiceFigures({ items, coupon: 'SAVE10' });

  assert.deepEqual(
    { discount: billed.discount, tax: billed.tax, total: billed.total },
    { discount: 150, tax: 142.5, total: 2992.5 }
  );
  assert.deepEqual(
    { discount: printed.discount, tax: printed.tax, total: printed.total },
    { discount: billed.discount, tax: billed.tax, total: billed.total }
  );
});

test('invoice interprets decimal gstRate values the same way as order pricing', () => {
  const item = { name: 'Decimal rate item', price: 100, qty: 1, gstRate: 0.05 };

  assert.equal(tax.getRateForItem(item), 0.05);
  const billed = pricing.computeTotals([item], '');
  const printed = invoice.computeInvoiceFigures({ items: [item], coupon: '' });

  assert.equal(billed.tax, 5);
  assert.equal(printed.rows[0].gstPercent, 5);
  assert.equal(printed.tax, billed.tax);
});

test('invoice displays pricing line GST and splits the total consistently', () => {
  const items = [
    { name: 'One', price: 0.05, qty: 1, gstRate: 18 },
    { name: 'Two', price: 0.05, qty: 1, gstRate: 18 }
  ];
  const printed = invoice.computeInvoiceFigures({ items, coupon: '' });

  assert.deepEqual(printed.rows.map((row) => row.lineTax), [0.01, 0.01]);
  assert.equal(printed.rows.reduce((sum, row) => sum + row.lineTax, 0), 0.02);
  assert.equal(printed.tax, 0.02);
  assert.equal(printed.cgst, 0.01);
  assert.equal(printed.sgst, 0.01);
});

test('GST reconciliation matches invoice figures to the stored order figures', () => {
  const items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }
  ];
  const billed = pricing.computeTotals(items, 'WELCOME');
  const db = {
    orders: [{
      id: 1,
      date: '2026-11-22',
      customer: 'Customer',
      coupon: 'WELCOME',
      items,
      subtotal: billed.subtotal,
      discount: billed.discount,
      tax: billed.tax,
      total: billed.total
    }]
  };

  const reconciliation = reports.getGstReconciliation(db);

  assert.equal(reconciliation.totalChecked, 1);
  assert.equal(reconciliation.mismatchCount, 0);
  assert.deepEqual(
    {
      ledgerTax: reconciliation.rows[0].ledgerTax,
      invoiceTax: reconciliation.rows[0].invoiceTax,
      ledgerTotal: reconciliation.rows[0].ledgerTotal,
      invoiceTotal: reconciliation.rows[0].invoiceTotal,
      delta: reconciliation.rows[0].delta,
      matched: reconciliation.rows[0].matched
    },
    {
      ledgerTax: 4.75,
      invoiceTax: 4.75,
      ledgerTotal: 99.75,
      invoiceTotal: 99.75,
      delta: 0,
      matched: true
    }
  );
});
