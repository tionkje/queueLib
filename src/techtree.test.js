import { TechTree } from './techtree.js';

const things = {
  producerA: { reqs: ['producerA'] },
  producerB: { reqs: ['producerA', 'researchB'] },
  researchB: { reqs: ['producerA'] }
};

it('has a techtree', () => {
  const TT = new TechTree(things);
  expect(TT.getProduceOptions('producerA')).toEqual(['producerA', 'researchB']);
  expect(TT.getProduceOptions('producerA', { researchB: true })).toEqual(['producerA', 'producerB', 'researchB']);
});
