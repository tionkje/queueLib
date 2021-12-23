export class Resource {
  _gathered;
  _spent = 0;
  get amount() {
    return this._gathered - this._spent;
  }
  constructor(init) {
    this._gathered = init || 0;
  }
  gather(amount) {
    this._gathered += amount;
  }
  canSpend(amount) {
    return this.amount >= amount;
  }
  spend(amount) {
    this._spent += amount;
  }
  toJSON() {
    return this.amount;
  }
  toString() {
    return this.amount.toString();
  }
}
