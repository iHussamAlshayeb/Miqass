const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const Appointment = require('../src/models/Appointment');
const Tenant = require('../src/models/Tenant');
const Barber = require('../src/models/Barber');
const mongoose = require('mongoose');
const { getCustomerAppointments, cancelCustomerAppointment, rescheduleCustomerAppointment } = require('../src/controllers/bookingController');

const secret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'customer-booking-test-secret';

const tenantId = '507f1f77bcf86cd799439011';
const customerId = '507f1f77bcf86cd799439012';
const appointmentId = '507f1f77bcf86cd799439013';

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const request = (token, params = {}) => ({
  get(name) { return name === 'X-Booking-Access' ? token : null; },
  params,
});

const accessToken = (scope = 'customer-bookings') => jwt.sign(
  { tenantId, customerId, scope },
  process.env.JWT_SECRET,
  { audience: 'customer-bookings', expiresIn: '20m' },
);

test('customer appointment list requires a scoped verification token', async () => {
  const denied = response();
  await getCustomerAppointments(request(null), denied);
  assert.equal(denied.statusCode, 401);

  const wrongScope = response();
  await getCustomerAppointments(request(accessToken('tenant-admin')), wrongScope);
  assert.equal(wrongScope.statusCode, 401);
});

test('customer appointment query stays scoped to tenant and customer', async () => {
  const original = Appointment.find;
  let query;
  Appointment.find = (filter) => {
    query = filter;
    return {
      select() { return this; },
      sort() { return this; },
      limit() { return this; },
      async lean() { return []; },
    };
  };
  try {
    const res = response();
    await getCustomerAppointments(request(accessToken()), res);
    assert.equal(res.statusCode, 200);
    assert.equal(query.tenantId, tenantId);
    assert.equal(query.customerId, customerId);
    assert.deepEqual(res.body.appointments, []);
  } finally {
    Appointment.find = original;
  }
});

test('a paid booking cannot be cancelled through customer self-service', async () => {
  const originalTenant = Tenant.findById;
  const originalAppointment = Appointment.findOne;
  Tenant.findById = async () => ({ settings: { startTime: '16:00' } });
  Appointment.findOne = async () => ({
    _id: appointmentId,
    status: 'Booked',
    saleId: null,
    date: '2099-01-01',
    timeSlot: '18:00',
    payment: { status: 'Paid' },
  });
  try {
    const res = response();
    await cancelCustomerAppointment(request(accessToken(), { appointmentId }), res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /بعربون/);
  } finally {
    Tenant.findById = originalTenant;
    Appointment.findOne = originalAppointment;
  }
});

test('rescheduling rejects a slot occupied by another appointment', async () => {
  const original = {
    tenant: Tenant.findById,
    appointment: Appointment.findOne,
    init: Appointment.init,
    deleteMany: Appointment.deleteMany,
    updateOne: Appointment.updateOne,
    exists: Appointment.exists,
    barber: Barber.findOne,
    transaction: mongoose.connection.transaction,
  };
  Tenant.findById = async () => ({ settings: { startTime: '16:00', endTime: '21:00', slotDuration: 30 } });
  Appointment.findOne = async () => ({
    _id: appointmentId, status: 'Booked', saleId: null,
    date: '2099-01-01', timeSlot: '18:00', totalDuration: 60,
    barberId: '507f1f77bcf86cd799439014', barberName: 'Barber',
    toObject() { return this; },
  });
  Barber.findOne = () => ({ select: async () => ({ leaves: [] }) });
  Appointment.init = async () => {};
  Appointment.deleteMany = () => ({ session: async () => {} });
  Appointment.updateOne = async () => ({ modifiedCount: 1 });
  Appointment.exists = () => ({ session: async () => true });
  mongoose.connection.transaction = async (callback) => callback({});
  try {
    const res = response();
    const req = { ...request(accessToken(), { appointmentId }), body: { date: '2099-01-01', timeSlot: '19:00' } };
    await rescheduleCustomerAppointment(req, res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /حُجز للتو/);
  } finally {
    Tenant.findById = original.tenant;
    Appointment.findOne = original.appointment;
    Appointment.init = original.init;
    Appointment.deleteMany = original.deleteMany;
    Appointment.updateOne = original.updateOne;
    Appointment.exists = original.exists;
    Barber.findOne = original.barber;
    mongoose.connection.transaction = original.transaction;
  }
});

test.after(() => {
  if (secret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = secret;
});
