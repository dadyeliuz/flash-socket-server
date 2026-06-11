/**
 * Helper to encode a string packet to a null-terminated buffer for transmission.
 */
export function encodePacket(content: string): Buffer {
  return Buffer.from(content + '\0', 'utf8');
}

/**
 * State accumulator for splitting null-terminated TCP socket streams.
 */
export class PacketAccumulator {
  private buffer = Buffer.alloc(0);
  private maxBufferSize = 65536; // 64KB per socket buffer guard

  /**
   * Appends incoming binary chunk and returns array of complete packets parsed.
   */
  public append(chunk: Buffer): string[] {
    if (this.buffer.length + chunk.length > this.maxBufferSize) {
      throw new Error('TCP Packet Accumulator Buffer Overflow limit exceeded');
    }

    this.buffer = Buffer.concat([this.buffer, chunk]);
    const packets: string[] = [];

    let zeroIndex = this.buffer.indexOf(0);
    while (zeroIndex !== -1) {
      const packet = this.buffer.subarray(0, zeroIndex).toString('utf8');
      packets.push(packet);
      
      // Advance buffer past null terminator
      this.buffer = this.buffer.subarray(zeroIndex + 1);
      zeroIndex = this.buffer.indexOf(0);
    }

    return packets;
  }
}
