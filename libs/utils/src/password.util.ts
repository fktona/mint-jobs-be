type BcryptLike = {
  hash(password: string, rounds: number): Promise<string>;
  compare(password: string, hash: string): Promise<boolean>;
};

const bcryptLibPromise: Promise<BcryptLike> = import('bcrypt')
  .then((mod) => mod as unknown as BcryptLike)
  .catch(() => import('bcryptjs').then((mod) => mod as unknown as BcryptLike));

/**
 * Hash a password
 */
export async function hashPassword(
  password: string,
  rounds: number = 10,
): Promise<string> {
  const bcrypt = await bcryptLibPromise;
  return bcrypt.hash(password, rounds);
}

/**
 * Compare password with hash
 */
export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  const bcrypt = await bcryptLibPromise;
  return bcrypt.compare(password, hash);
}
