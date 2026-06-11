import { describe, it, expect } from 'vitest';
import { PacketAccumulator, encodePacket } from '../codec';

describe('SFS Packet Codec', () => {
  it('should cleanly encode string packets to null-terminated buffers', () => {
    const packet = 'hello';
    const encoded = encodePacket(packet);
    expect(encoded[encoded.length - 1]).toBe(0); // trailing null byte
    expect(encoded.toString('utf8')).toBe('hello\0');
  });

  it('should split multiple complete null-terminated packets', () => {
    const accumulator = new PacketAccumulator();
    const data = Buffer.from('packet1\0packet2\0', 'utf8');
    const result = accumulator.append(data);
    expect(result).toEqual(['packet1', 'packet2']);
  });

  it('should accumulate and reconstruct fragmented packets', () => {
    const accumulator = new PacketAccumulator();
    
    // Send first fragment
    const frag1 = Buffer.from('partia', 'utf8');
    const res1 = accumulator.append(frag1);
    expect(res1).toEqual([]);

    // Send second fragment completing the packet
    const frag2 = Buffer.from('l_packet\0', 'utf8');
    const res2 = accumulator.append(frag2);
    expect(res2).toEqual(['partial_packet']);
  });

  it('should protect against buffer overflow limit', () => {
    const accumulator = new PacketAccumulator();
    const giantChunk = Buffer.alloc(70000); // Exceeds 64KB
    expect(() => accumulator.append(giantChunk)).toThrow();
  });
});
