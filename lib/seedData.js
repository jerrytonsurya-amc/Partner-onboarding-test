/* Sample QC applications and the demo agent portfolio. Same records the screens used to keep in the browser. */
const APPROVER = 'QC Approver';
const d = (s) => new Date(s).toISOString();

function sample(o) {
  const person = o.entity === 'Individual' || o.entity === 'Proprietor';
  return {
    id: o.id, ref: o.ref, name: o.name, mobile: o.mobile, email: o.email, entity: o.entity, dob: o.dob, pan: o.pan,
    appStatus: o.status || 'Submitted', submittedAt: d(o.at), gstRegistered: !!o.gstin, address: '', timeline: [{ ts: d(o.at), status: 'Submitted' }],
    kyc: {
      mobileOk: true, emailOk: true,
      pan: { ok: true, name: o.name.toUpperCase(), dob: o.dob, type: person ? 'Individual' : o.entity === 'Company' ? 'Company' : 'Firm', status: 'Valid – Existing & Active', at: d(o.at) },
      aadhaar: { ok: true, at: d(o.at), name: o.aadhaarName || o.name, signatory: !person, dob: o.aadhaarDob || o.dob, gender: o.gender || 'Male', masked: 'XXXX XXXX ' + o.a4, address: Object.assign({ country: 'India' }, o.addr) },
      decl: { fatca: true, pep: true, at: d(o.at) },
      bank: Object.assign({ ok: true, mode: 'upi', method: 'UPI ₹1 verification', type: 'Savings', beneficiary: (o.bankName || o.name).toUpperCase(), nameMatch: o.bankMatch || 100, cheque: null }, o.bank),
      gst: o.gstin ? { ok: true, gstin: o.gstin, legalName: o.name.toUpperCase(), status: 'Active', state: 'State code ' + o.gstin.slice(0, 2) } : { ok: true, skipped: true },
      docs: o.docs || {},
    },
    qc: o.qc || null, agreement: o.agreement || null,
  };
}

const A = {
  chennai: { house: 'No. 27, Ground Floor', street: 'Ranganathan Street, T. Nagar', landmark: 'Opposite Panagal Park', city: 'Chennai', district: 'Chennai', state: 'Tamil Nadu', pin: '600017' },
  blr: { house: 'Flat 4B, Sai Krupa Apartments', street: '12th Cross Road, Indiranagar', landmark: 'Near Indiranagar Metro Station', city: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pin: '560038' },
  mum: { house: 'B-302, Shanti Niketan CHS', street: 'S.V. Road, Andheri West', landmark: 'Near Andheri Railway Station', city: 'Mumbai', district: 'Mumbai Suburban', state: 'Maharashtra', pin: '400058' },
  hyd: { house: 'H.No. 8-2-293/82', street: 'Road No. 10, Jubilee Hills', landmark: 'Behind Apollo Hospital', city: 'Hyderabad', district: 'Hyderabad', state: 'Telangana', pin: '500033' },
  cbe: { house: '45/2, Lakshmi Nivas', street: 'Race Course Road, Gopalapuram', landmark: 'Near Race Course', city: 'Coimbatore', district: 'Coimbatore', state: 'Tamil Nadu', pin: '641018' },
};

function buildSampleApps() {
  return [
    sample({ id: 'S1', ref: 'SCL-LD-20261020-000001', name: 'Meera Krishnan', mobile: '9840011223', email: 'meera.k@example.com', entity: 'Individual', dob: '1988-03-14', pan: 'BKMPK2231F', gender: 'Female', a4: '4821', addr: A.chennai, at: '2026-10-20T10:15:00', bank: { acc: 'XXXXXXXX4521', ifsc: 'HDFC0001234', bank: 'HDFC Bank', branch: 'T Nagar' } }),
    sample({ id: 'S2', ref: 'SCL-LD-20261020-000002', name: 'Arjun Mehta', mobile: '9820033445', email: 'arjun.mehta@example.com', entity: 'Proprietor', dob: '1984-11-02', pan: 'CDMPM7781K', a4: '3390', addr: A.mum, at: '2026-10-20T09:02:00', gstin: '27CDMPM7781K1Z2', bank: { mode: 'manual', method: 'Penny drop ₹1', acc: 'XXXXXXXX7710', ifsc: 'ICIC0002211', bank: 'ICICI Bank', branch: 'Andheri West', type: 'Current' }, docs: { udyam: { name: 'udyam_certificate.pdf', size: 182344 } } }),
    sample({ id: 'S3', ref: 'SCL-LD-20261019-000001', name: 'Kaveri Wealth Partners', mobile: '9445045678', email: 'kaveri.wp@example.com', entity: 'Partnership', dob: '2016-04-01', pan: 'AAKFK5521L', aadhaarName: 'Rahul Sharma', aadhaarDob: '1979-06-21', a4: '2045', addr: A.cbe, at: '2026-10-19T17:40:00', gstin: '33AAKFK5521L1Z8', bankName: 'K Karthikeyan', bankMatch: 40, bank: { mode: 'manual', method: 'Penny drop ₹1 + cancelled cheque', acc: 'XXXXXXXX0000', ifsc: 'CNRB0001122', bank: 'Canara Bank', branch: 'Gopalapuram', type: 'Current', cheque: { name: 'cancelled_cheque.jpg', size: 204811 } }, docs: { deed: { name: 'partnership_deed.pdf', size: 402211 } } }),
    sample({ id: 'S4', ref: 'SCL-LD-20261019-000002', name: 'Nimbus Finserv Pvt Ltd', mobile: '9000011122', email: 'ops@nimbusfinserv.example', entity: 'Company', dob: '2018-07-01', pan: 'AAHCN4410Q', aadhaarName: 'Vikram Rao', aadhaarDob: '1975-02-09', a4: '5501', addr: A.blr, at: '2026-10-19T12:20:00', gstin: '29AAHCN4410Q1Z4', bank: { mode: 'manual', method: 'Penny drop ₹1', acc: 'XXXXXXXX1199', ifsc: 'UTIB0000987', bank: 'Axis Bank', branch: 'Indiranagar', type: 'Current' }, docs: { coi: { name: 'certificate_of_incorporation.pdf', size: 120440 } } }),
    sample({ id: 'S5', ref: 'SCL-LD-20261018-000001', name: 'Priya Venkatesh', mobile: '9600034567', email: 'priya.v@example.com', entity: 'Individual', dob: '1991-08-09', pan: 'DEFPV2468M', gender: 'Female', a4: '6612', addr: A.cbe, at: '2026-10-18T15:05:00', bank: { acc: 'XXXXXXXX3307', ifsc: 'HDFC0001234', bank: 'HDFC Bank', branch: 'Main Branch' },
      status: 'Approved', qc: { decision: 'Approved', by: APPROVER, at: d('2026-10-19T11:30:00'), eAgreement: { sentAt: d('2026-10-19T11:30:00') }, commercials: { interest: [{ from: 9, to: 10, then: 0.5 }, { from: 10, to: 12, then: 0.75 }], procFee: [{ op: '<', amount: 500000, share: 300 }, { op: '>=', amount: 500000, share: 500 }] } },
      agreement: { signedAt: d('2026-10-19T15:05:00'), docId: 'ESG48210377', agentCode: 'SCL-AG-000001' } }),
    sample({ id: 'S6', ref: 'SCL-LD-20261018-000002', name: 'Suresh Kumar', mobile: '9884055566', email: 'suresh.kumar@example.com', entity: 'Individual', dob: '1986-12-30', pan: 'FGHPK9753P', a4: '7756', addr: A.hyd, at: '2026-10-18T10:45:00', bank: { mode: 'manual', method: 'Penny drop ₹1', acc: 'XXXXXXXX6620', ifsc: 'KKBK0007788', bank: 'Kotak Mahindra Bank', branch: 'Jubilee Hills' },
      status: 'Approved', qc: { decision: 'Approved', by: APPROVER, at: d('2026-10-18T16:10:00'), eAgreement: { sentAt: d('2026-10-18T16:10:00') }, commercials: { interest: null, procFee: [{ op: '>=', amount: 100000, share: 250 }] } } }),
    sample({ id: 'S7', ref: 'SCL-LD-20261017-000001', name: 'Ganesh & Co', mobile: '9176056789', email: 'ganesh.co@example.com', entity: 'Partnership', dob: '2012-01-15', pan: 'AAGFG3301H', aadhaarName: 'Suresh Kumar', aadhaarDob: '1970-05-05', a4: '1187', addr: A.chennai, at: '2026-10-17T14:00:00', bank: { acc: 'XXXXXXXX9033', ifsc: 'SBIN0004455', bank: 'State Bank of India', branch: 'T Nagar' }, docs: { deed: { name: 'deed_scan_partial.pdf', size: 88000 } },
      status: 'Rejected', qc: { decision: 'Rejected', by: APPROVER, at: d('2026-10-18T12:00:00'), reason: 'Incomplete or invalid documents', remarks: 'Partnership deed is missing pages 3–5 (partner signatures).' } }),
  ];
}

const DEMO_LEADS = [
  { id: 'LD-30018', name: 'Hariprasath V', mobile: '8903263193', pan: 'AWLPH7421F', email: '', product: 'Loan against securities', status: 'Not started', createdAt: d('2026-08-04T17:03:00') },
  { id: 'LD-30022', name: 'Kavitha Raman', mobile: '9841022331', pan: 'BQRPR6612K', email: 'kavitha.r@example.com', product: 'Loan against mutual funds', status: 'In progress', createdAt: d('2026-09-12T11:20:00') },
  { id: 'LD-30027', name: 'Sanjay Menon', mobile: '9884011245', pan: 'CTMPM2290L', email: '', product: 'Loan against mutual funds', status: 'Disbursed', sanctioned: 900000, disbursed: 750000, createdAt: d('2026-09-28T15:45:00') },
  { id: 'LD-30031', name: 'Deepa Natarajan', mobile: '9790033447', pan: 'DNKPN8823P', email: '', product: 'Loan against mutual funds', status: 'Sanctioned', sanctioned: 500000, createdAt: d('2026-10-10T10:05:00') },
];

module.exports = { buildSampleApps, DEMO_LEADS, DEMO_AGENT: 'SCL-AG-000001' };
