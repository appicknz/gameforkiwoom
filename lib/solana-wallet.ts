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
import bs58 from "bs58"

function getMasterSeed(): Buffer {
  const raw = process.env.SOLANA_HD_SEED
  if (!raw) throw new Error("SOLANA_HD_SEED 환경변수가 설정되지 않았습니다.")

  // 니모닉(12/24 단어)인지 hex인지 판단
  if (raw.trim().includes(" ")) {
    if (!bip39.validateMnemonic(raw.trim())) {
      throw new Error("SOLANA_HD_SEED 니모닉이 유효하지 않습니다.")
    }
    return bip39.mnemonicToSeedSync(raw.trim())
  }

  // hex string
  if (raw.length !== 128) {
    throw new Error("SOLANA_HD_SEED hex는 128자(64바이트)여야 합니다.")
  }
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
  return bs58.encode(keypair.publicKey)
}
