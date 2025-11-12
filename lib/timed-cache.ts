import assert from "node:assert";

interface ExpirableItem<Value> {
  value: Value;
  expiresAt: number;
}

class Node<Key, Value> {
  public previous: Node<Key, Value>;
  public next: Node<Key, Value>;

  constructor(
    public key: Key | null = null,
    public value: Value | null = null,
    previous?: Node<Key, Value>,
    next?: Node<Key, Value>,
  ) {
    this.previous = previous ?? this;
    this.next = next ?? this;
  }
}

class TimedLruCache<Key, Value> {
  private cache: Map<Key, Node<Key, ExpirableItem<Value>>>;
  private head: Node<Key, ExpirableItem<Value>>;

  constructor(
    private defaultTimeout = 60,
    private maxSize = 1000,
  ) {
    if (defaultTimeout <= 0 || maxSize < 1) {
      throw RangeError("Invalid arguments for the TimedLruCache.");
    }
    this.cache = new Map<Key, Node<Key, ExpirableItem<Value>>>();
    this.head = new Node<Key, ExpirableItem<Value>>();
  }

  public delete(key: Key) {
    const node = this.cache.get(key);
    if (node === undefined) {
      return false;
    }

    node.previous.next = node.next;
    node.next.previous = node.previous;
    assert(this.cache.delete(key), "Failed to delete timed cache");
    return true;
  }

  public set(key: Key, value: Value, timeout?: number) {
    const newNode = new Node(
      key,
      {
        value,
        expiresAt: Date.now() / 1000 + (timeout ?? this.defaultTimeout),
      },
      this.head,
      this.head.next,
    );
    this.head.next = newNode;
    newNode.next.previous = newNode;
    this.cache.set(key, newNode);

    if (this.cache.size <= this.maxSize) {
      return;
    }

    const lastNode = this.head.previous;
    lastNode.previous.next = this.head;
    this.head.previous = lastNode.previous;
    assert(lastNode.key !== null, "Only the head can have null key and value.");
    this.cache.delete(lastNode.key);
  }

  public get(key: Key) {
    const item = this.cache.get(key);
    if (item === undefined) {
      return undefined;
    }

    assert(
      item.key !== null && item.value !== null,
      "Only the head can have null key and value.",
    );

    item.previous.next = item.next;
    item.next.previous = item.previous;

    if (item.value.expiresAt - 10 <= Date.now() / 1000) {
      this.cache.delete(item.key);
      return undefined;
    }

    item.previous = this.head;
    item.next = this.head.next;
    this.head.next = item;
    item.next.previous = item;

    return item.value;
  }

  public has(key: Key) {
    return this.get(key) !== undefined;
  }
}

const urlTimeout = 300;
const urlCache = new TimedLruCache<string, string>(urlTimeout);

export { TimedLruCache, urlTimeout, urlCache };
