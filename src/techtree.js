export class TechTree {
  tree = {};

  constructor(tree) {
    this.tree = tree;
    Object.values(tree).forEach((x) => (x.reqs = x.reqs || []));
  }

  getProduceOptions(name, ...args) {
    const _avail = Object.assign({ [name]: true }, ...args);
    return Object.keys(this.tree).filter((k) => this.tree[k].reqs.every((name) => _avail[name]));
  }
  getRequiredBy(name, ...args) {
    const _avail = Object.assign({ [name]: true }, ...args);
    return Object.keys(this.tree).filter((k) => Object.keys(_avail).every((n) => this.tree[k].reqs.includes(n)));
  }
}
