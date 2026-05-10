/**
 * Solana HD Wallet 파생
 * - 마스터 시드: SOLANA_HD_SEED 환경변수 (64자 hex 또는 BIP39 니모닉)
 * - 파생 경로: m/44'/501'/{index}'/0'  (Solana BIP44 표준)
 * - 개인키는 서버 메모리에서만 사용, DB에 저장 안 함
 */

import "server-only"
import { derivePath } from "ed25519-hd-key"
import * as bip39 from "bip39"
import nacl from "tweetnacl"
// bs58 v5는 default export, v4는 named export — 양쪽 모두 호환
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _bs58 = require("bs58")
const bs58encode: (b: Uint8Array) => string = _bs58.default?.encode ?? _bs58.encode

function getMasterSeed(): Buffer {
  const raw = process.env.SOLANA_HD_SEED
  if (!raw) throw new Error("SOLANA_HD_SEED 환경변수가 설정되지 않았습니다.")

  // 공백이 포함되면 니모닉으로 처리 (validateMnemonic 검증 생략 — wordlist 언어 차이로 false 반환 가능)
  if (raw.trim().includes(" ")) {
    return bip39.mnemonicToSeedSync(raw.trim())
  }

  // hex string (128자 = 64바이트)
  return Buffer.from(raw, "hex")
}

/**
 * 유저 인덱스로 Solana 지갑 주소를 파생합니다.
 * @param index profiles.wallet_index (0-based, 회원가입 순서)
 * @returns base58 인코딩된 Solana public key 주소
 */
export function deriveWalletAddress(index: number): string {
  const seed = getMasterSeed()
  const path = `m/44'/501'/${index}'/0'`
  const { key } = derivePath(path, seed.toString("hex"))
  // @solana/web3.js 없이 tweetnacl + bs58 로 public key 파생
  const keypair = nacl.sign.keyPair.fromSeed(key)
  return bs58encode(keypair.publicKey)
}
